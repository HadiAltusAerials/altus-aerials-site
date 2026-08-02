// GET /.netlify/functions/availability?date=YYYY-MM-DD
// Returns the open (bookable) start times for that date, after excluding
// closed days, blocked dates, confirmed bookings, and still-live holds.
const { computeOpenSlots } = require("./_lib/availability");

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const dateStr = event.queryStringParameters && event.queryStringParameters.date;
  if (!dateStr) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "missing_date" }),
    };
  }

  try {
    const result = await computeOpenSlots(dateStr);
    const statusCode = result.error ? 400 : 200;
    return {
      statusCode,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    console.error("availability function error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      // Temporary: includes the real error message/stack so we can diagnose
      // a live-only failure. Safe to leave for now (no secrets in here), but
      // worth tightening back to a bare "server_error" once things are solid.
      body: JSON.stringify({ error: "server_error", detail: err.message, stack: err.stack }),
    };
  }
};
