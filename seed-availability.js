import "dotenv/config";
import { bulkInsertSlots } from "./db.js";

// Edit these to match the real schedule, then run `npm run seed`.
// Sun/Mon closed by default.
const DAYS_AHEAD = 14;
const OPEN_HOURS = ["11:00", "14:00", "17:00"]; // start times of bookable blocks
const CLOSED_WEEKDAYS = [0, 1]; // 0 = Sunday, 1 = Monday

const today = new Date();
const rows = [];

for (let i = 0; i < DAYS_AHEAD; i++) {
  const d = new Date(today);
  d.setDate(today.getDate() + i);
  if (CLOSED_WEEKDAYS.includes(d.getDay())) continue;

  const dateStr = d.toISOString().slice(0, 10);
  for (const time of OPEN_HOURS) {
    rows.push({ date: dateStr, time });
  }
}

await bulkInsertSlots(rows);
console.log(`Seeded up to ${rows.length} slots across the next ${DAYS_AHEAD} days.`);
