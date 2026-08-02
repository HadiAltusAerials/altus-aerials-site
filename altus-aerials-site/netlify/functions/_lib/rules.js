// ---------------------------------------------------------------------
// Altus Aerials booking rules
// ---------------------------------------------------------------------
// Edit the values below to match how you actually want to take bookings.
// No coding knowledge needed beyond changing these numbers/lists — just
// keep the same format. Redeploy (drag the folder onto Netlify again, or
// push to GitHub if that's connected) after any change.
// ---------------------------------------------------------------------

module.exports = {
  // Which days of the week you're bookable. 0 = Sunday, 1 = Monday, ... 6 = Saturday.
  // Default below: Monday through Saturday, closed Sundays.
  bookableDays: [1, 2, 3, 4, 5, 6],

  // Start times you're willing to begin a shoot, in 24-hour "HH:MM" format.
  // Default below: every 2 hours from 8am to 4pm (last start time 4pm).
  startTimes: ["08:00", "10:00", "12:00", "14:00", "16:00"],

  // How long a booking occupies on the schedule, in minutes, regardless of
  // package. (Simple v1 — every package blocks the same size window. If your
  // packages vary a lot in on-site time, tell Claude and this can be made
  // package-specific instead.)
  slotDurationMinutes: 120,

  // Minimum notice required, in hours, before the earliest bookable slot.
  // Default below: 24 hours.
  minLeadHours: 24,

  // How far in the future clients can book, in days.
  maxAdvanceDays: 60,

  // Specific dates you're closed/unavailable even though they'd otherwise be
  // bookable (holidays, vacations, already-booked-elsewhere days). Add more
  // "YYYY-MM-DD" strings as needed.
  blockedDates: [],

  // How long an unpaid slot selection is held before it's released back to
  // everyone else, in minutes. Keep this short — it's just long enough for
  // someone to fill out the rest of the form and complete Stripe checkout.
  holdExpiryMinutes: 20,
};
