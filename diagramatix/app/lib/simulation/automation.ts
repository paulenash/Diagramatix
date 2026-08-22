/**
 * Which activities are performed by a SYSTEM rather than by people.
 *
 * A Service / Script / Business-Rule task drawn in the Sales lane still belongs
 * to Sales organisationally — that is why it is drawn there — but no one in
 * Sales spends time on it. Treating it as human work took a person from the
 * pool, stopped it overnight on their calendar, and queued it behind their other
 * work: it inflated the team's utilisation AND invented delays that don't exist.
 *
 * So the lane says who OWNS a step; the resource says what it CONSUMES. These
 * are the defaults only — every activity's resource stays editable.
 */

import type { DiagramData, DiagramElement, BpmnTaskType } from "@/app/lib/diagram/types";

/** Task types performed by a system. `send` / `receive` are deliberately absent:
 *  a message task is as often a person emailing a customer, so they keep the
 *  lane's team by default and can be changed. `none` is unspecified → human. */
const AUTOMATED_TASK_TYPES = new Set<BpmnTaskType>(["service", "script", "business-rule"]);

/** The shared resource automated work is charged to. Created only when a model
 *  actually contains automated activities — harvested from what the user drew,
 *  never conjured — and editable like any other resource. */
export const AUTOMATED_RESOURCE_NAME = "Automation";

/** Effectively unconstrained. A capacity of 1 would put every automated activity
 *  in the process behind a single slot, replacing one silent bottleneck with
 *  another; automation is rarely the constraint. Lower it deliberately to model
 *  a system that IS limited (an API with four concurrent slots, say). */
export const AUTOMATED_RESOURCE_CAPACITY = 999;

/** The calendar automated work runs on: around the clock. */
export const AUTOMATED_CALENDAR_NAME = "24/7";

/** Is this activity performed by a system rather than by people? */
export function isAutomatedActivity(el: DiagramElement): boolean {
  if (el.type !== "task") return false; // a sub-process is timed by its contents
  return !!el.taskType && AUTOMATED_TASK_TYPES.has(el.taskType);
}

/** Does any diagram in the set contain automated work? Drives whether the
 *  Automated resource is worth creating at all. */
export function hasAutomatedWork(diagrams: DiagramData[]): boolean {
  return diagrams.some((d) => (d?.elements ?? []).some(isAutomatedActivity));
}
