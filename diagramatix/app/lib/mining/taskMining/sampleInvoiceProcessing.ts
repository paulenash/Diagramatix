/**
 * Task Mining sample — "Enter Invoice" (the UI task inside a Purchase-to-Pay
 * process). The clerk copies Vendor + Amount from an Excel sheet into an AP web
 * form, validates, and submits. Two routines:
 *   • happy path — copy/paste both fields, validate, submit; and
 *   • rework path — validation fails on the Amount, so they bounce back to Excel,
 *     re-copy the Amount, re-paste, re-validate, then submit (ping-pong + rework).
 *
 * 100 cases across 5 WORKING DAYS (Mon–Fri, 09:00–17:00 UTC) starting Monday
 * 2026-03-02 09:00. Deterministic timestamps (fixed base + fixed offsets) — no
 * Date.now, so tests and the baked example stay reproducible. The mining analytics
 * bucket by UTC day/hour, so this reads as Mon–Fri working hours.
 */
import type { TaskInteraction, TaskActionType } from "./schema";

interface Step { application: string; window?: string; control?: string; actionType: TaskActionType; object?: string; sec: number }

// Monday 2026-03-02 09:00:00 UTC (a Monday). Each working day = +1 calendar day
// (Mon→Fri are consecutive, no weekend inside the 5).
const BASE_MS = Date.parse("2026-03-02T09:00:00Z");
const DAY_MS = 86_400_000;
const WORK_HOURS = 8; // 09:00–17:00

const FORM = "AP Portal – New Invoice";
const SHEET = "Invoices.xlsx";

/** Steps shared by both routines up to the first Validate. */
function commonSteps(inv: string): Step[] {
  return [
    { application: "Excel", window: SHEET, actionType: "openApp", object: inv, sec: 0 },
    { application: "Excel", window: SHEET, control: "Vendor", actionType: "copy", object: inv, sec: 8 },
    { application: "Chrome", window: FORM, actionType: "switchApp", object: inv, sec: 12 },
    { application: "Chrome", window: FORM, control: "Vendor", actionType: "paste", object: inv, sec: 16 },
    { application: "Excel", window: SHEET, actionType: "switchApp", object: inv, sec: 22 },
    { application: "Excel", window: SHEET, control: "Amount", actionType: "copy", object: inv, sec: 27 },
    { application: "Chrome", window: FORM, actionType: "switchApp", object: inv, sec: 31 },
    { application: "Chrome", window: FORM, control: "Amount", actionType: "paste", object: inv, sec: 35 },
    { application: "Chrome", window: FORM, control: "Validate", actionType: "validate", object: inv, sec: 41 },
  ];
}

const happyTail = (inv: string): Step[] => [
  { application: "Chrome", window: FORM, control: "Submit", actionType: "submit", object: inv, sec: 47 },
];

// Rework: Validate failed on the Amount → back to Excel, re-copy, re-paste, re-validate, submit.
const reworkTail = (inv: string): Step[] => [
  { application: "Excel", window: SHEET, actionType: "switchApp", object: inv, sec: 49 },
  { application: "Excel", window: SHEET, control: "Amount", actionType: "copy", object: inv, sec: 55 },
  { application: "Chrome", window: FORM, actionType: "switchApp", object: inv, sec: 59 },
  { application: "Chrome", window: FORM, control: "Amount", actionType: "paste", object: inv, sec: 64 },
  { application: "Chrome", window: FORM, control: "Validate", actionType: "validate", object: inv, sec: 71 },
  { application: "Chrome", window: FORM, control: "Submit", actionType: "submit", object: inv, sec: 77 },
];

const ACTORS = ["Priya Nadella", "Sam Turner", "Lee Okafor"];

/** Build the sample log: `total` cases spread over 5 working days during working
 *  hours; `reworkPct` of them follow the rework routine (distributed, not clumped). */
export function buildInvoiceProcessingTaskLog(total = 100, reworkPct = 0.3): TaskInteraction[] {
  const out: TaskInteraction[] = [];
  const DAYS = 5;
  const perDay = Math.ceil(total / DAYS);
  const slotSec = (WORK_HOURS * 3600) / perDay;       // even spacing across the working day
  const reworkCut = Math.round((1 - reworkPct) * 10); // last `reworkPct*10` of each 10 are rework

  for (let ci = 0; ci < total; ci++) {
    const day = Math.min(DAYS - 1, Math.floor(ci / perDay));
    const slot = ci % perDay;
    const inv = `INV-${1042 + ci}`;
    const actor = ACTORS[ci % ACTORS.length];
    const isRework = ci % 10 >= reworkCut;             // ~reworkPct, evenly interleaved
    const jitter = ((ci * 37) % 120) * 1000;           // deterministic 0–119s wobble
    const caseStart = BASE_MS + day * DAY_MS + Math.round(slot * slotSec) * 1000 + jitter;
    const steps = isRework ? [...commonSteps(inv), ...reworkTail(inv)] : [...commonSteps(inv), ...happyTail(inv)];
    steps.forEach((s, si) => {
      out.push({
        taskCaseId: inv,
        seq: si,
        timestamp: new Date(caseStart + s.sec * 1000).toISOString(),
        actor,
        application: s.application,
        window: s.window,
        control: s.control,
        actionType: s.actionType,
        object: s.object,
      });
    });
  }
  return out;
}

/** The default built-in sample (100 cases over Mon–Fri working hours; 30% rework). */
export const INVOICE_PROCESSING_TASK_LOG: TaskInteraction[] = buildInvoiceProcessingTaskLog();
