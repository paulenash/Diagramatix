/**
 * Changing a black-box pool's "IT System" flag retypes the tasks that talk to it.
 *
 * Paul, 2026-09-18, verbatim:
 *   "New rule for changing the Black-box IT System flag (either in Properties or
 *    using the right-click menu). If the Pool having the flag changed has one or
 *    more existing message flows to or from it, then,
 *    1. Flag is changed to IT System = true, then if any Task associated with a
 *       message to or from the Pool that used to be type Send or Receive, change
 *       that Task's Task type to User.
 *    2. Flag is changed to IT System = false, then if any Task associated with a
 *       message to or from the Pool used to be type User, change that Task's
 *       Task type to a) Send if all of its messages are to the Pool, b) Receive
 *       if all its messages are from the Pool, c) any mix of to and from the
 *       Pool, then change the Task type to None."
 *
 * Why it reads that way: a Send or Receive task is a person or service handing a
 * message to another PARTICIPANT. Once the counterparty is an IT system, the
 * step is somebody working in that system — a User task — not a message
 * exchange with an outside party. Turning the flag back off returns the task to
 * whichever message task its own traffic says it is, and refuses to guess when
 * the task both sends and receives.
 *
 * One reading had to be settled. "all of its messages" is taken over ALL of the
 * task's message flows, not only those with this pool: a task that sends to one
 * participant and receives from another is not a Send task by any reading, and
 * BPMN's Send/Receive types are about the task's own behaviour rather than one
 * counterparty. Flagged to Paul.
 *
 * Pure. The reducer applies what this returns, so both the Properties panel
 * checkbox and the right-click menu get the same behaviour from one place.
 */
import type { BpmnTaskType, Connector, DiagramElement } from "./types";

/** BPMN message flow. `messageBPMN` is the canvas type; `message` is what the
 *  AI/EPC translation shapes emit before normalisation. */
export function isMessageFlow(c: Connector): boolean {
  return c.type === "messageBPMN" || c.type === "message";
}

export interface TaskTypeChange {
  id: string;
  from: BpmnTaskType;
  to: BpmnTaskType;
}

const taskTypeOf = (el: DiagramElement): BpmnTaskType => (el.taskType ?? "none") as BpmnTaskType;

/**
 * The retypes to apply when `poolId`'s IT System flag becomes `nextIsSystem`.
 * Returns [] when nothing should change — including when the pool has no
 * message flows at all, which is the precondition in Paul's rule.
 */
export function retypeTasksForSystemFlag(
  elements: DiagramElement[],
  connectors: Connector[],
  poolId: string,
  nextIsSystem: boolean,
): TaskTypeChange[] {
  const messages = connectors.filter(isMessageFlow);
  // Paul's precondition — "if the Pool … has one or more existing message flows"
  // — needs no separate test: with none, there are no partners to retype.
  const withPool = messages.filter((c) => c.sourceId === poolId || c.targetId === poolId);

  const byId = new Map(elements.map((e) => [e.id, e]));
  const partners = new Set<string>();
  for (const c of withPool) {
    const otherId = c.sourceId === poolId ? c.targetId : c.sourceId;
    if (byId.get(otherId)?.type === "task") partners.add(otherId);
  }

  const changes: TaskTypeChange[] = [];
  for (const id of partners) {
    const from = taskTypeOf(byId.get(id)!);
    let to: BpmnTaskType | null = null;

    if (nextIsSystem) {
      // The counterparty is now a system: a message task becomes a User task.
      if (from === "send" || from === "receive") to = "user";
    } else if (from === "user") {
      // Back to a participant: let the task's own traffic decide.
      const mine = messages.filter((c) => c.sourceId === id || c.targetId === id);
      const sends = mine.some((c) => c.sourceId === id);
      const receives = mine.some((c) => c.targetId === id);
      to = sends && receives ? "none" : sends ? "send" : receives ? "receive" : null;
    }

    // `to` is only ever set to something the task is not: the first branch
    // only fires on send/receive and writes "user", the second only on "user"
    // and writes something else. So a null check is the whole test — a
    // to !== from guard alongside it would be code no input can reach.
    if (to !== null) changes.push({ id, from, to });
  }
  return changes;
}

/** Apply the changes to an element list, leaving everything else untouched. */
export function applyTaskTypeChanges(
  elements: DiagramElement[],
  changes: TaskTypeChange[],
): DiagramElement[] {
  if (changes.length === 0) return elements;
  const to = new Map(changes.map((c) => [c.id, c.to]));
  return elements.map((el) => (to.has(el.id) ? { ...el, taskType: to.get(el.id)! } : el));
}
