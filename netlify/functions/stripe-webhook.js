// POST /.netlify/functions/stripe-webhook
// Configure this URL as a Stripe webhook endpoint (Stripe Dashboard ->
// Developers -> Webhooks -> Add endpoint), subscribed to the
// "checkout.session.completed" event. Paste the endpoint's signing secret
// into this site's Netlify environment variables as STRIPE_WEBHOOK_SECRET.
//
// This is the ONLY place a slot becomes permanently booked. Until this
// fires with a real, verified, successful payment, the slot is at most a
// short-lived hold (see create-hold.js) that expires on its own.
const Stripe = require("stripe");
const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async (event) => {
  // Required for Netlify Blobs to work from a classic (Lambda-compatible)
  // function handler in production — see availability.js for the full note.
  connectLambda(event);

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not set in this site's environment variables.");
    return { statusCode: 500, body: "Webhook not configured" };
  }

  const signature = event.headers["stripe-signature"] || event.headers["Stripe-Signature"];
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body;

  // The Stripe secret key isn't actually needed to verify+read a webhook
  // payload, but the Stripe SDK requires one to construct the client.
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_placeholder", {
    apiVersion: "2024-06-20",
  });

  let stripeEvent;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return { statusCode: 400, body: "Signature verification failed" };
  }

  if (stripeEvent.type !== "checkout.session.completed") {
    // Not an event we act on — acknowledge it so Stripe stops retrying.
    return { statusCode: 200, body: "ignored" };
  }

  const session = stripeEvent.data.object;
  const bookingId = session.client_reference_id;

  if (!bookingId) {
    console.error("checkout.session.completed with no client_reference_id — cannot match to a hold. Session id:", session.id);
    return { statusCode: 200, body: "no_reference_id" };
  }

  try {
    const holdsStore = getStore("holds");
    const bookingsStore = getStore("bookings");

    const hold = await holdsStore.get("id:" + bookingId, { type: "json" });

    if (!hold) {
      // Payment succeeded but we have no matching hold (expired hold that
      // was garbage-collected, or something else went wrong). The customer
      // DID pay, so we must not silently drop this — create the booking
      // anyway from whatever Stripe gives us, and flag it for a manual look.
      console.error(
        "Paid checkout with no matching hold for bookingId " + bookingId +
        ". Session id: " + session.id + ". NEEDS MANUAL REVIEW to confirm no double-booking."
      );
      const fallbackRecord = {
        id: bookingId,
        stripeSessionId: session.id,
        amountPaid: session.amount_total,
        paidAt: Date.now(),
        needsManualReview: true,
        customerEmail: (session.customer_details && session.customer_details.email) || null,
      };
      await bookingsStore.setJSON("id:" + bookingId, fallbackRecord);
      return { statusCode: 200, body: "booked_without_hold_needs_review" };
    }

    // Promote the hold to a permanent, paid booking.
    const bookingRecord = Object.assign({}, hold, {
      stripeSessionId: session.id,
      amountPaid: session.amount_total,
      paidAt: Date.now(),
    });

    await bookingsStore.setJSON("id:" + bookingId, bookingRecord);

    const dateKey = "by-date:" + hold.date;
    const existing = (await bookingsStore.get(dateKey, { type: "json" })) || [];
    existing.push({ id: bookingId, time: hold.time, package: hold.package, name: hold.name });
    await bookingsStore.setJSON(dateKey, existing);

    // Clean up the now-redundant hold so it doesn't linger.
    await holdsStore.delete("id:" + bookingId);

    return { statusCode: 200, body: "booked" };
  } catch (err) {
    console.error("stripe-webhook processing error:", err);
    // Return 500 so Stripe retries this event later.
    return { statusCode: 500, body: "processing_error" };
  }
};
