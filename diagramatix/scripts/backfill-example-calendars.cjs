/**
 * Back-fill every starter example's team library with a standard working
 * calendar: Mon–Fri 9–5 with an hour for lunch (09:00–12:00, 13:00–17:00).
 *
 * Each package gains a `calendars` entry ("Business hours") and every HUMAN team
 * is linked to it by name. AI/agent/automation teams are left 24/7 (they don't
 * keep office hours) — this keeps the Aardwolf As-is vs To-be comparison honest:
 * the manual process is throttled to business hours, the AI agent isn't.
 *
 * The example-seeds test harness assembles WITHOUT calendars, so this is a pure
 * additive change to the portable package (validated by validateExamplePackage);
 * the calendars take effect when a learner adopts + runs the example.
 *
 * Re-run:  node scripts/backfill-example-calendars.cjs
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "app", "lib", "simulation", "exampleData.json");
const CAL_NAME = "Business hours";
const BUSINESS_HOURS = {
  intervals: [0, 1, 2, 3, 4].flatMap((day) => [
    { day, start: "09:00", end: "12:00" },
    { day, start: "13:00", end: "17:00" },
  ]),
};
// Teams that model automation, not people — left 24/7.
const IS_AUTOMATION = (name) => /\b(ai|agent|bot|automat|robot|system)\b/i.test(name);

const doc = JSON.parse(fs.readFileSync(OUT, "utf8"));
let touched = 0;
for (const ex of doc.examples) {
  const pkg = ex.package;
  // Add/replace the Business hours calendar (idempotent).
  pkg.calendars = (pkg.calendars ?? []).filter((c) => c.name !== CAL_NAME);
  pkg.calendars.push({ name: CAL_NAME, pattern: BUSINESS_HOURS });
  // Link human teams to it (leave automation teams 24/7).
  for (const t of pkg.teams ?? []) {
    if (IS_AUTOMATION(t.name)) { delete t.calendarName; continue; }
    t.calendarName = CAL_NAME;
  }
  touched++;
  const human = (pkg.teams ?? []).filter((t) => !IS_AUTOMATION(t.name)).map((t) => t.name);
  const auto = (pkg.teams ?? []).filter((t) => IS_AUTOMATION(t.name)).map((t) => t.name);
  console.log(`  ${ex.slug}: ${human.length} team(s) → ${CAL_NAME}${auto.length ? ` · 24/7: ${auto.join(", ")}` : ""}`);
}

fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`Back-filled ${touched} example(s) with the "${CAL_NAME}" calendar.`);
