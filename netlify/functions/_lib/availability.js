// Shared logic for computing open slots on a given date, used by both the
// availability-check endpoint and the create-hold endpoint (which re-checks
// before committing, to close the race-condition window as much as possible).

const { getStore } = require("@netlify/blobs");
const rules = require("./rules");

function pad(n) {
  return String(n).length < 2 ? "0" + n : String(n);
}

function parseISODate(dateStr) {
  // Expects "YYYY-MM-DD". Constructed in UTC to avoid server-timezone drift.
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

function isValidDateString(dateStr) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && parseISODate(dateStr) !== null;
}

async function getBookedTimesForDate(dateStr) {
  const bookingsStore = getStore("bookings");
  const holdsStore = getStore("holds");

  const [bookingsList, holdsList] = await Promise.all([
    bookingsStore.get("by-date:" + dateStr, { type: "json" }),
    holdsStore.get("by-date:" + dateStr, { type: "json" }),
  ]);

  const now = Date.now();
  const taken = new Set();

  (bookingsList || []).forEach((b) => taken.add(b.time));
  (holdsList || []).forEach((h) => {
    if (h.expiresAt > now) taken.add(h.time);
  });

  return taken;
}

async function computeOpenSlots(dateStr) {
  if (!isValidDateString(dateStr)) {
    return { error: "invalid_date" };
  }

  const date = parseISODate(dateStr);
  const dayOfWeek = date.getUTCDay();

  if (!rules.bookableDays.includes(dayOfWeek)) {
    return { date: dateStr, slots: [] };
  }
  if (rules.blockedDates.includes(dateStr)) {
    return { date: dateStr, slots: [] };
  }

  const now = new Date();
  const earliestBookable = new Date(now.getTime() + rules.minLeadHours * 60 * 60 * 1000);
  const latestBookable = new Date(now.getTime() + rules.maxAdvanceDays * 24 * 60 * 60 * 1000);

  if (date > latestBookable) {
    return { date: dateStr, slots: [] };
  }

  const taken = await getBookedTimesForDate(dateStr);

  const openSlots = rules.startTimes.filter((time) => {
    if (taken.has(time)) return false;

    const [hh, mm] = time.split(":").map(Number);
    const slotDateTime = new Date(date.getTime());
    slotDateTime.setUTCHours(hh, mm, 0, 0);

    return slotDateTime >= earliestBookable;
  });

  return { date: dateStr, slots: openSlots };
}

module.exports = { computeOpenSlots, isValidDateString, getBookedTimesForDate, pad };
