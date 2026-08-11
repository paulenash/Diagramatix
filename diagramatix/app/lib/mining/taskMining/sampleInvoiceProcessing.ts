/**
 * Task Mining sample — "Enter Invoice" (the UI task inside a Purchase-to-Pay
 * process). The clerk copies Vendor + Amount from an Excel sheet into an AP web
 * form, validates, and submits. Two variants:
 *   • happy path — copy/paste both fields, validate, submit; and
 *   • rework path — validation fails on the Amount, so they bounce back to Excel,
 *     re-copy the Amount, re-paste, re-validate, then submit (ping-pong + rework).
 *
 * This is the Phase 0 fixture that proves the existing miner renders a task
 * routine map (and is the seed for the flagship "Invoice Processing" example).
 * Deterministic timestamps (fixed base + fixed offsets) — no Date.now, so tests
 * and any future example seed are reproducible.
 */
import type { TaskInteraction, TaskActionType } from "./schema";

interface Step { application: string; window?: string; control?: string; actionType: TaskActionType; object?: string; sec: number }

// Base epoch for case 0, step 0: 2026-03-02T09:00:00Z (a Monday). Each case starts
// ~11 min after the previous; `sec` is the offset (seconds) of a step within its case.
const BASE_MS = Date.parse("2026-03-02T09:00:00Z");
const CASE_GAP_MS = 11 * 60_000;

const FORM = "AP Portal – New Invoice";
const SHEET = "Invoices.xlsx";

/** Steps shared by both variants up to the first Validate. */
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

const ACTORS = ["Priya", "Sam", "Lee"];

/** Build the sample log. `happy` + `rework` = number of case instances of each. */
export function buildInvoiceProcessingTaskLog(happy = 7, rework = 3): TaskInteraction[] {
  const out: TaskInteraction[] = [];
  const cases: Array<{ variant: "happy" | "rework" }> = [
    ...Array.from({ length: happy }, () => ({ variant: "happy" as const })),
    ...Array.from({ length: rework }, () => ({ variant: "rework" as const })),
  ];
  cases.forEach((c, ci) => {
    const inv = `INV-${1042 + ci}`;
    const actor = ACTORS[ci % ACTORS.length];
    const caseStart = BASE_MS + ci * CASE_GAP_MS;
    const steps = c.variant === "happy"
      ? [...commonSteps(inv), ...happyTail(inv)]
      : [...commonSteps(inv), ...reworkTail(inv)];
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
  });
  return out;
}

/** The default sample (10 cases: 7 happy, 3 rework). */
export const INVOICE_PROCESSING_TASK_LOG: TaskInteraction[] = buildInvoiceProcessingTaskLog();
