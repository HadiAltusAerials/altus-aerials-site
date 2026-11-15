// POST /.netlify/functions/create-hold
// Body (JSON): { date, time, package, name, email, phone, address, shootType,
//                notes, referral, staging, videoStyle2 }
//
// Prices are worked out HERE, on the server, from the package plus any
// add-ons (virtual staging, a second Summit video), so the total can't be
// changed from the browser. If STRIPE_SECRET_KEY is set in Netlify's
// environment variables, this also creates a Stripe Checkout for that exact
// total and returns its URL. If it isn't set, or Stripe errors, the
// confirmation page falls back to the fixed per-package payment links.
//
// Re-checks the slot is still open, then reserves it for `holdExpiryMinutes`
// (see _lib/rules.js) while the client completes Stripe checkout. Nothing is
// permanently booked here — the stripe-webhook function is what converts a
// hold into a real booking, and only once payment actually succeeds. If
// checkout is abandoned, the hold simply expires and stops counting against
// availability — no manual cleanup needed.
const crypto = require("crypto");
const { getStore, connectLambda } = require("@netlify/blobs");
const rules = require("./_lib/rules");
const { computeOpenSlots, isValidDateString } = require("./_lib/availability");

const PACKAGE_PRICES = {
  Overview: 149,
  Showcase: 349,
  Signature: 499,
  Summit: 649,
};
const STAGING_PRICE = 50;          // Showcase, Signature, Summit only
const SECOND_VIDEO_PRICE = 150;    // Summit only
const STAGING_PACKAGES = new Set(["Showcase", "Signature", "Summit"]);

// Package + add-ons -> line items and total (whole dollars).
function priceBooking(pkg, opts) {
  const items = [{ name: pkg + " package", amount: PACKAGE_PRICES[pkg] }];
  const video2 = typeof opts.videoStyle2 === "string" ? opts.videoStyle2.trim().slice(0, 60) : "";
  if (pkg === "Summit" && video2) items.push({ name: "Second video style: " + video2, amount: SECOND_VIDEO_PRICE });
  if (opts.staging === true && STAGING_PACKAGES.has(pkg)) items.push({ name: "Virtual staging", amount: STAGING_PRICE });
  const total = items.reduce((sum, i) => sum + i.amount, 0);
  return { items, total };
}

// Swappable so the local tests can use a fake Stripe client.
let stripeFactory = (key) => new (require("stripe"))(key, { apiVersion: "2024-06-20" });

async function createCheckout({ bookingId, email, items, now }) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  try {
    const stripe = stripeFactory(key);
    const origin = (process.env.URL || "https://altusaerials.com").replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: bookingId,
      customer_email: email,
      line_items: items.map((i) => ({
        quantity: 1,
        price_data: { currency: "usd", unit_amount: i.amount * 100, product_data: { name: i.name } },
      })),
      success_url: origin + "/book-shoot-confirm.html?paid=1",
      cancel_url: origin + "/book",
      // Stripe's minimum lifetime for a checkout is 30 minutes.
      expires_at: Math.floor(now / 1000) + 31 * 60,
    });
    return session.url || null;
  } catch (err) {
    console.error("Stripe checkout creation failed; falling back to payment links:", err.message);
    return null;
  }
}

exports.handler = async (event) => {
  // Required for Netlify Blobs to work from a classic (Lambda-compatible)
  // function handler in production — see availability.js for the full note.
  connectLambda(event);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return jsonResponse(400, { error: "invalid_json" });
  }

  const { date, time, package: pkg, name, email, phone, address, shootType, notes, referral, staging, videoStyle2 } = payload;

  if (!date || !time || !pkg || !name || !email || !phone || !address || !shootType) {
    return jsonResponse(400, { error: "missing_fields" });
  }
  if (!isValidDateString(date)) {
    return jsonResponse(400, { error: "invalid_date" });
  }
  const allTimes = new Set([].concat(rules.startTimes, ...Object.values(rules.startTimesByDay || {})));
  if (!allTimes.has(time)) {
    return jsonResponse(400, { error: "invalid_time" });
  }
  if (!(pkg in PACKAGE_PRICES)) {
    return jsonResponse(400, { error: "invalid_package" });
  }

  try {
    // Defensive re-check: is this slot still actually open right now?
    const current = await computeOpenSlots(date);
    if (current.error) {
      return jsonResponse(400, { error: current.error });
    }
    if (!current.slots.includes(time)) {
      return jsonResponse(409, { error: "slot_taken" });
    }

    const holdsStore = getStore("holds");
    const bookingId = crypto.randomUUID();
    const now = Date.now();
    const pricing = priceBooking(pkg, { staging, videoStyle2 });
    const expiresAt = now + rules.holdExpiryMinutes * 60 * 1000;

    const holdRecord = {
      id: bookingId,
      date,
      time,
      package: pkg,
      price: pricing.total,
      lineItems: pricing.items,
      name,
      email,
      phone,
      address,
      shootType,
      notes: notes || "",
      referral: referral || "",
      createdAt: now,
      expiresAt,
    };

    // Store the full record by id (for the webhook to look up later)...
    await holdsStore.setJSON("id:" + bookingId, holdRecord);

    // ...and a lightweight entry in the per-date list (for availability checks).
    // Note: this read-modify-write isn't atomic. At the low volume this site
    // expects, the odds of two people hitting the exact same date's list in
    // the same instant are very low, but it's a known limitation of using a
    // simple blob store instead of a real database with transactions.
    const dateKey = "by-date:" + date;
    const existing = (await holdsStore.get(dateKey, { type: "json" })) || [];
    const stillLive = existing.filter((h) => h.expiresAt > now);
    stillLive.push({ id: bookingId, time, expiresAt });
    await holdsStore.setJSON(dateKey, stillLive);

    const checkoutUrl = await createCheckout({ bookingId, email, items: pricing.items, now });

    return jsonResponse(200, { ok: true, bookingId, expiresAt, total: pricing.total, checkoutUrl });
  } catch (err) {
    console.error("create-hold function error:", err);
    // Temporary: real error detail for diagnosing a live-only failure.
    return jsonResponse(500, { error: "server_error", detail: err.message, stack: err.stack });
  }
};

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  };
}

exports.priceBooking = priceBooking;
exports._setStripeFactory = (fn) => { stripeFactory = fn; };
