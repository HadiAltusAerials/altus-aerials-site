// Local test harness: exercises the real netlify/functions files by
// intercepting require("@netlify/blobs") to point at an in-memory fake,
// since the sandboxed environment can't reach Netlify's real dev-server
// infra (its edge-functions bootstrap needs a network download that's
// blocked here). This still runs the actual, unmodified function code.
const path = require("path");
const Module = require("module");

const fakeBlobsPath = path.join(__dirname, "fake-netlify-blobs.js");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...args) {
  if (request === "@netlify/blobs") return fakeBlobsPath;
  return originalResolve.call(this, request, ...args);
};

const assert = require("assert");
const Stripe = require("stripe");

const FUNCTIONS_DIR = path.join(__dirname, "..", "netlify", "functions");
const availabilityFn = require(path.join(FUNCTIONS_DIR, "availability.js"));
const createHoldFn = require(path.join(FUNCTIONS_DIR, "create-hold.js"));
const stripeWebhookFn = require(path.join(FUNCTIONS_DIR, "stripe-webhook.js"));
const { __stores } = require("./fake-netlify-blobs.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log("PASS:", name);
      passed++;
    })
    .catch((err) => {
      console.log("FAIL:", name, "\n     ", err.message);
      failed++;
    });
}

// A date comfortably in the future, past minLeadHours and inside
// maxAdvanceDays, matching one of the configured startTimes' day-of-week
// rules. We just pick "30 days from now" and adjust to a bookable weekday.
function futureDateStr(daysAhead) {
  const d = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  // Nudge forward to a Tuesday-Friday (bookable, and no Monday override).
  while (d.getUTCDay() < 2 || d.getUTCDay() > 5) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function main() {
  const testDate = futureDateStr(30);

  await test("availability: rejects missing date", async () => {
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: {} });
    assert.strictEqual(res.statusCode, 400);
  });

  await test("availability: rejects malformed date", async () => {
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: "not-a-date" } });
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(body.error, "invalid_date");
  });

  await test("availability: returns all 4 slots open on a fresh future weekday", async () => {
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: testDate } });
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200);
    assert.deepStrictEqual(body.slots, ["09:00", "11:00", "13:00", "15:00"]);
  });

  await test("availability: Sundays are closed", async () => {
    // Find the next Sunday after testDate.
    const d = new Date(testDate + "T00:00:00Z");
    while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() + 1);
    const sundayStr = d.toISOString().slice(0, 10);
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: sundayStr } });
    const body = JSON.parse(res.body);
    assert.deepStrictEqual(body.slots, []);
  });

  const holdPayload = {
    date: testDate,
    time: "11:00",
    package: "Signature",
    name: "Test Client",
    email: "test@example.com",
    phone: "555-555-5555",
    address: "123 Main St",
    shootType: "Real Estate Listing",
    notes: "",
    referral: "",
  };
  let bookingId;

  await test("create-hold: rejects missing required fields", async () => {
    const res = await createHoldFn.handler({ httpMethod: "POST", body: JSON.stringify({ date: testDate }) });
    assert.strictEqual(res.statusCode, 400);
  });

  await test("create-hold: succeeds for an open slot", async () => {
    const res = await createHoldFn.handler({ httpMethod: "POST", body: JSON.stringify(holdPayload) });
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200, "expected 200, got " + res.statusCode + " body=" + res.body);
    assert.ok(body.bookingId);
    bookingId = body.bookingId;
  });

  await test("availability: the just-held slot no longer shows as open", async () => {
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: testDate } });
    const body = JSON.parse(res.body);
    assert.ok(!body.slots.includes("11:00"), "11:00 should be held, got slots=" + JSON.stringify(body.slots));
  });

  await test("create-hold: a second person can't grab the same held slot", async () => {
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { name: "Second Client", email: "second@example.com" })),
    });
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 409);
    assert.strictEqual(body.error, "slot_taken");
  });

  await test("create-hold: a different time on the same date still works", async () => {
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { time: "13:00", email: "third@example.com" })),
    });
    assert.strictEqual(res.statusCode, 200);
  });

  // ---- Stripe webhook signature verification + booking promotion ----
  const webhookSecret = "whsec_test_secret";
  process.env.STRIPE_WEBHOOK_SECRET = webhookSecret;
  const stripeTestClient = new Stripe("sk_test_placeholder", { apiVersion: "2024-06-20" });

  const sessionPayload = {
    id: "cs_test_123",
    object: "checkout.session",
    client_reference_id: bookingId,
    amount_total: 49900,
    customer_details: { email: "test@example.com" },
  };
  const eventPayload = JSON.stringify({
    id: "evt_test_123",
    object: "event",
    type: "checkout.session.completed",
    data: { object: sessionPayload },
  });
  const header = stripeTestClient.webhooks.generateTestHeaderString({
    payload: eventPayload,
    secret: webhookSecret,
  });

  await test("availability: Saturdays are closed", async () => {
    const d = new Date(testDate + "T00:00:00Z");
    while (d.getUTCDay() !== 6) d.setUTCDate(d.getUTCDate() + 1);
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: d.toISOString().slice(0, 10) } });
    assert.deepStrictEqual(JSON.parse(res.body).slots, []);
  });

  await test("availability: Mondays end with a 1pm start", async () => {
    const d = new Date(testDate + "T00:00:00Z");
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: d.toISOString().slice(0, 10) } });
    assert.deepStrictEqual(JSON.parse(res.body).slots, ["09:00", "11:00", "13:00"]);
  });

  await test("create-hold: Summit can be booked", async () => {
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { time: "15:00", package: "Summit", email: "summit@example.com" })),
    });
    assert.strictEqual(res.statusCode, 200, res.body);
  });

  await test("create-hold: retired packages are rejected", async () => {
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { time: "09:00", package: "Occasion", email: "old@example.com" })),
    });
    assert.strictEqual(JSON.parse(res.body).error, "invalid_package");
  });

  await test("pricing: package alone, plus staging, plus second video", async () => {
    const p = createHoldFn.priceBooking;
    assert.strictEqual(p("Signature", {}).total, 499);
    assert.strictEqual(p("Signature", { staging: true }).total, 549);
    assert.strictEqual(p("Overview", { staging: true }).total, 149, "Overview can't take staging");
    assert.strictEqual(p("Showcase", { videoStyle2: "Walkthrough" }).total, 349, "second video is Summit-only");
    assert.strictEqual(p("Summit", { staging: true, videoStyle2: "Walkthrough" }).total, 849);
    assert.strictEqual(p("Summit", { staging: "true" }).total, 649, "staging must be a real boolean");
  });

  await test("create-hold: no Stripe key -> no checkout URL, total still returned", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { date: "2026-12-14", time: "09:00", package: "Signature", staging: true, email: "s1@example.com" })),
    });
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.strictEqual(body.total, 549);
    assert.strictEqual(body.checkoutUrl, null);
  });

  await test("create-hold: with a Stripe key, creates a checkout for the exact total", async () => {
    let captured = null;
    createHoldFn._setStripeFactory(() => ({ checkout: { sessions: { create: async (args) => { captured = args; return { url: "https://checkout.stripe.com/c/pay/cs_test_123" }; } } } }));
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { date: "2026-12-14", time: "11:00", package: "Summit", staging: true, videoStyle2: "Walkthrough", email: "s2@example.com" })),
    });
    delete process.env.STRIPE_SECRET_KEY;
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.strictEqual(body.checkoutUrl, "https://checkout.stripe.com/c/pay/cs_test_123");
    const cents = captured.line_items.reduce((s, li) => s + li.price_data.unit_amount, 0);
    assert.strictEqual(cents, 84900);
    assert.strictEqual(captured.client_reference_id, body.bookingId);
  });

  await test("create-hold: Stripe error falls back cleanly (hold still made)", async () => {
    createHoldFn._setStripeFactory(() => ({ checkout: { sessions: { create: async () => { throw new Error("boom"); } } } }));
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    const res = await createHoldFn.handler({
      httpMethod: "POST",
      body: JSON.stringify(Object.assign({}, holdPayload, { date: "2026-12-14", time: "13:00", package: "Showcase", email: "s3@example.com" })),
    });
    delete process.env.STRIPE_SECRET_KEY;
    const body = JSON.parse(res.body);
    assert.strictEqual(res.statusCode, 200, res.body);
    assert.strictEqual(body.checkoutUrl, null);
    assert.strictEqual(body.total, 349);
  });

  await test("stripe-webhook: rejects a bad signature", async () => {
    const res = await stripeWebhookFn.handler({
      httpMethod: "POST",
      headers: { "stripe-signature": "t=1,v1=deadbeef" },
      body: eventPayload,
      isBase64Encoded: false,
    });
    assert.strictEqual(res.statusCode, 400);
  });

  await test("stripe-webhook: promotes a valid hold to a paid booking", async () => {
    const res = await stripeWebhookFn.handler({
      httpMethod: "POST",
      headers: { "stripe-signature": header },
      body: eventPayload,
      isBase64Encoded: false,
    });
    assert.strictEqual(res.statusCode, 200, "body=" + res.body);
  });

  await test("availability: the paid slot stays unavailable after the hold is gone", async () => {
    const res = await availabilityFn.handler({ httpMethod: "GET", queryStringParameters: { date: testDate } });
    const body = JSON.parse(res.body);
    assert.ok(!body.slots.includes("11:00"), "paid 11:00 slot should still be blocked, got " + JSON.stringify(body.slots));
  });

  await test("stripe-webhook: handles payment with no matching hold (manual-review fallback) without crashing", async () => {
    const orphanPayload = JSON.stringify({
      id: "evt_test_orphan",
      object: "event",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test_orphan",
          client_reference_id: "nonexistent-id",
          amount_total: 14900,
          customer_details: { email: "orphan@example.com" },
        },
      },
    });
    const orphanHeader = stripeTestClient.webhooks.generateTestHeaderString({
      payload: orphanPayload,
      secret: webhookSecret,
    });
    const res = await stripeWebhookFn.handler({
      httpMethod: "POST",
      headers: { "stripe-signature": orphanHeader },
      body: orphanPayload,
      isBase64Encoded: false,
    });
    assert.strictEqual(res.statusCode, 200);
  });

  console.log("\n" + passed + " passed, " + failed + " failed");
  if (failed > 0) process.exitCode = 1;
}

main();
