/**
 * Task Mining — the task-log schema (Phase 0 spike).
 *
 * A task-mining event is ONE user-interaction (UI) step INSIDE a single task
 * execution — e.g. "copy the Amount cell in Excel", "paste it into the web form",
 * "click Validate". This is finer-grained than a process-mining event (a business
 * milestone across a whole process).
 *
 * KEY THESIS (see plans/task-mining.md): a task log is just an event log at UI
 * granularity, so it feeds the EXISTING DiagramatixMINER discovery unchanged —
 * `taskCaseId` → caseId, a composed UI-step label → activity, timestamp → timestamp,
 * actor → resource. `toEventLog()` produces exactly the `{headers, rows, mapping}`
 * that `buildEventLog()` consumes. No new discovery engine; a new schema + mapping.
 *
 * Pure data — no DB, no React. Values here must never carry raw PII (see valueMasked).
 */
import type { LogMapping } from "../types";

/** The kind of UI action a step represents. */
export type TaskActionType =
  | "openApp" | "switchApp" | "navigate"
  | "click" | "type" | "select" | "hotkey"
  | "copy" | "paste"
  | "validate" | "submit" | "wait";

/** One raw user-interaction step. `object` links the step to a business object
 *  (invoice no, customer id) for the OCEL-style object dimension; `valueMasked`
 *  is an already-redacted field value (for copy→paste lineage) — NEVER raw PII. */
export interface TaskInteraction {
  taskCaseId: string;      // one execution of the task (the mining "case")
  seq: number;             // step order within the case (timestamp tiebreaker)
  timestamp: string;       // ISO 8601
  actor: string;           // user / resource who performed the step
  application: string;     // "Excel", "Chrome", "Outlook", …
  window?: string;         // window/screen title, e.g. "Invoices.xlsx"
  control?: string;        // UI control/field, e.g. "Amount", "Submit"
  actionType: TaskActionType;
  object?: string;         // business object touched (OCEL object), e.g. "INV-1042"
  valueMasked?: string;    // redacted value only — never raw PII
}

const VERB: Record<TaskActionType, string> = {
  openApp: "Open", switchApp: "Switch to", navigate: "Navigate",
  click: "Click", type: "Type", select: "Select", hotkey: "Hotkey",
  copy: "Copy", paste: "Paste", validate: "Validate", submit: "Submit", wait: "Wait",
};

/** Normalise a raw interaction into a stable ACTIVITY label — the unit the routine
 *  map's nodes are keyed on. App-scoped so "Excel: Copy Amount" ≠ "Chrome: Paste
 *  Amount", and app switches read as their own step ("Switch to Chrome"). */
export function taskStepLabel(i: TaskInteraction): string {
  const verb = VERB[i.actionType] ?? i.actionType;
  if (i.actionType === "openApp" || i.actionType === "switchApp") {
    return `${verb} ${i.application}`.trim();
  }
  // Drop a control that merely repeats the verb (a "Submit" button + submit action
  // → "Chrome: Submit", not "Chrome: Submit Submit").
  const ctl = i.control && i.control.toLowerCase() !== verb.toLowerCase() ? ` ${i.control}` : "";
  return `${i.application}: ${verb}${ctl}`.trim();
}

/** The flat columns a task log projects onto for the existing miner. */
export const TASK_LOG_HEADERS = ["taskCaseId", "activity", "timestamp", "actor", "object"] as const;

/** The mapping that points the existing `buildEventLog` at those columns. */
export const TASK_LOG_MAPPING: LogMapping = {
  caseId: "taskCaseId",
  activity: "activity",
  timestamp: "timestamp",
  resource: "actor",
  entityType: "object",
};

/** Project raw task interactions onto the `{headers, rows, mapping}` the existing
 *  DiagramatixMINER pipeline consumes — the whole point of Phase 0. Rows are sorted
 *  by (case, timestamp, seq) so directly-follows order is deterministic. */
export function toEventLog(interactions: TaskInteraction[]): { headers: string[]; rows: string[][]; mapping: LogMapping } {
  const sorted = [...interactions].sort((a, b) =>
    a.taskCaseId === b.taskCaseId
      ? (a.timestamp === b.timestamp ? a.seq - b.seq : (a.timestamp < b.timestamp ? -1 : 1))
      : (a.taskCaseId < b.taskCaseId ? -1 : 1),
  );
  const rows = sorted.map((i) => [i.taskCaseId, taskStepLabel(i), i.timestamp, i.actor, i.object ?? ""]);
  return { headers: [...TASK_LOG_HEADERS], rows, mapping: TASK_LOG_MAPPING };
}
