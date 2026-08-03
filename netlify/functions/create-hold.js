// POST /.netlify/functions/create-hold
// Body (JSON): { date, time, package, name, email, phone, address, shootType,
//                notes, referral }
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
  Showcase: 249,
  Signature: 349,
  Occasion: 449,
  Inspection: 129,
  "Claim Documentation": 179,
  "Progress Documentation": 299,
};

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

  const { date, time, package: pkg, name, email, phone, address, shootType, notes, referral } = payload;

  if (!date || !time || !pkg || !name || !email || !phone || !address || !shootType) {
    return jsonResponse(400, { error: "missing_fields" });
  }
  if (!isValidDateString(date)) {
    return jsonResponse(400, { error: "invalid_date" });
  }
  if (!rules.startTimes.includes(time)) {
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
    const expiresAt = now + rules.holdExpiryMinutes * 60 * 1000;

    const holdRecord = {
      id: bookingId,
      date,
      time,
      package: pkg,
      price: PACKAGE_PRICES[pkg],
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

    return jsonResponse(200, { ok: true, bookingId, expiresAt });
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
