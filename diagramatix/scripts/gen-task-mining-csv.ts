/**
 * Generate a LARGER "Enter Invoice" task-mining CSV for the example:
 *   • 1,500 cases over ~3 months (Jan–Mar 2026), working days, 09:00–17:00 UTC,
 *   • 8 actors,
 *   • a LOWER ping-pong rate than the built-in sample but still significant:
 *       60% "batched" (copy both fields in one Excel visit → one switch → 0 bounces),
 *       25% "interleaved" (Excel↔Chrome per field → 2 bounces),
 *       15% "rework" (interleaved + re-copy the Amount → 4 bounces).
 * Deterministic (index-based, no Date.now/random). Writes to mining/ + scratchpad/.
 *   cd diagramatix && export PATH="$PATH:/c/Program Files/nodejs"
 *   npx tsx scripts/gen-task-mining-csv.ts
 */
import { writeFileSync } from "fs";
import { join } from "path";
import type { TaskInteraction, TaskActionType } from "../app/lib/mining/taskMining/schema";
import { toEventLog } from "../app/lib/mining/taskMining/schema";

const FORM = "AP Portal – New Invoice";
const SHEET = "Invoices.xlsx";
type S = { app: string; win?: string; ctl?: string; act: TaskActionType; sec: number };

// Batched — copy BOTH fields in one Excel visit, one switch, paste both. 0 bounces.
const batched = (): S[] => [
  { app: "Excel", win: SHEET, act: "openApp", sec: 0 },
  { app: "Excel", win: SHEET, ctl: "Vendor", act: "copy", sec: 7 },
  { app: "Excel", win: SHEET, ctl: "Amount", act: "copy", sec: 13 },
  { app: "Chrome", win: FORM, act: "switchApp", sec: 17 },
  { app: "Chrome", win: FORM, ctl: "Vendor", act: "paste", sec: 21 },
  { app: "Chrome", win: FORM, ctl: "Amount", act: "paste", sec: 26 },
  { app: "Chrome", win: FORM, ctl: "Validate", act: "validate", sec: 32 },
  { app: "Chrome", win: FORM, ctl: "Submit", act: "submit", sec: 38 },
];
// Interleaved — a field at a time (Excel↔Chrome). 2 bounces.
const interleaved = (): S[] => [
  { app: "Excel", win: SHEET, act: "openApp", sec: 0 },
  { app: "Excel", win: SHEET, ctl: "Vendor", act: "copy", sec: 8 },
  { app: "Chrome", win: FORM, act: "switchApp", sec: 12 },
  { app: "Chrome", win: FORM, ctl: "Vendor", act: "paste", sec: 16 },
  { app: "Excel", win: SHEET, act: "switchApp", sec: 22 },
  { app: "Excel", win: SHEET, ctl: "Amount", act: "copy", sec: 27 },
  { app: "Chrome", win: FORM, act: "switchApp", sec: 31 },
  { app: "Chrome", win: FORM, ctl: "Amount", act: "paste", sec: 35 },
  { app: "Chrome", win: FORM, ctl: "Validate", act: "validate", sec: 41 },
  { app: "Chrome", win: FORM, ctl: "Submit", act: "submit", sec: 47 },
];
// Rework — interleaved, but the Amount fails validation → re-copy. 4 bounces.
const rework = (): S[] => [
  ...interleaved().slice(0, 9),
  { app: "Excel", win: SHEET, act: "switchApp", sec: 49 },
  { app: "Excel", win: SHEET, ctl: "Amount", act: "copy", sec: 55 },
  { app: "Chrome", win: FORM, act: "switchApp", sec: 59 },
  { app: "Chrome", win: FORM, ctl: "Amount", act: "paste", sec: 64 },
  { app: "Chrome", win: FORM, ctl: "Validate", act: "validate", sec: 71 },
  { app: "Chrome", win: FORM, ctl: "Submit", act: "submit", sec: 77 },
];

const ACTORS = ["Priya Nadella", "Sam Turner", "Lee Okafor", "Maria Alvarez", "Tom Becker", "Aisha Khan", "Diego Santos", "Nina Petrova"];
const DAY_MS = 86_400_000, WORK_HOURS = 8;
const isWeekend = (ms: number) => { const d = new Date(ms).getUTCDay(); return d === 0 || d === 6; };

function build(total = 1500): TaskInteraction[] {
  // Working days from Monday 2026-01-05 09:00 UTC onward.
  const start = Date.parse("2026-01-05T09:00:00Z");
  const workDays: number[] = [];
  for (let d = 0; workDays.length < Math.ceil(total / 22) + 5; d++) {
    const ms = start + d * DAY_MS;
    if (!isWeekend(ms)) workDays.push(ms);
  }
  const perDay = Math.ceil(total / workDays.length);
  const slotSec = (WORK_HOURS * 3600) / perDay;

  const out: TaskInteraction[] = [];
  for (let ci = 0; ci < total; ci++) {
    const r = ci % 20;                                   // 0–11 batched, 12–16 interleaved, 17–19 rework
    const steps = r < 12 ? batched() : r < 17 ? interleaved() : rework();
    const inv = `INV-${100042 + ci}`;
    const actor = ACTORS[ci % ACTORS.length];
    const dayIdx = Math.floor(ci / perDay);
    const slot = ci % perDay;
    const jitter = ((ci * 37) % 180) * 1000;
    const caseStart = workDays[dayIdx] + Math.round(slot * slotSec) * 1000 + jitter;
    steps.forEach((s, si) => out.push({
      taskCaseId: inv, seq: si, timestamp: new Date(caseStart + s.sec * 1000).toISOString(),
      actor, application: s.app, window: s.win, control: s.ctl, actionType: s.act, object: inv,
    }));
  }
  return out;
}

const q = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const toCsv = (headers: string[], rows: string[][]) => [headers, ...rows].map((r) => r.map(q).join(",")).join("\n") + "\n";

const { headers, rows } = toEventLog(build());
const csv = toCsv(headers, rows);
const distinctCases = new Set(rows.map((r) => r[0])).size;
for (const dir of [join(__dirname, "..", "..", "mining"), join(__dirname, "..", "..", "scratchpad")]) {
  try { writeFileSync(join(dir, "enter-invoice-task-log-large.csv"), csv, "utf8"); } catch { /* dir may not exist */ }
}
console.log(`Wrote enter-invoice-task-log-large.csv — ${distinctCases} cases, ${rows.length} rows, 8 actors, Jan–Mar 2026.`);
