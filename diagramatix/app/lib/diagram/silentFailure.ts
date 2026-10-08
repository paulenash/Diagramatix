/**
 * Generation side of the "Silent Failure" rules (R8.47 / R8.48) — applied to the AI's plan before it is laid out.
 *
 *   R8.47  An edge-mounted event never leads straight to an End Event: a User Task is put between them.
 *   R8.48  An End Event that finishes an exception path is a Terminate End Event.
 *
 * The scanner (diagramChecks B56 / B57) reports what a person has drawn; this makes generation obey the same rules, so a generated diagram
 * does not arrive with a finding the scanner would raise. Both read the exception path from exceptionPath(), so they cannot disagree.
 */
import type { AiConnection, AiElement } from "./bpmnLayout";
import { exceptionPath } from "./exceptionPaths";

export interface SilentFailureResult {
  elements: AiElement[];
  connections: AiConnection[];
  /** Tasks inserted between an event and its End Event. */
  addedTasks: { eventId: string; eventLabel: string; taskId: string; endLabel: string }[];
  /** End Events switched to Terminate. */
  terminated: { id: string; label: string }[];
}

const isSequence = (c: AiConnection) => !c.type || c.type === "sequence";

export function enforceSilentFailureRules(elements: AiElement[], connections: AiConnection[]): SilentFailureResult {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const emies = elements.filter((e) => e.type === "intermediate-event" && !!e.boundaryHost);
  const addedTasks: SilentFailureResult["addedTasks"] = [];
  const newElements: AiElement[] = [];
  let conns = connections;

  // R8.47 — a Task between the event and the End Event.
  for (const ev of emies) {
    conns = conns.flatMap((c) => {
      if (c.sourceId !== ev.id || !isSequence(c)) return [c];
      const end = byId.get(c.targetId);
      if (!end || end.type !== "end-event") return [c];
      const taskId = `_sf_task_${ev.id}_${addedTasks.length}`;
      newElements.push({
        id: taskId, type: "task", taskType: "user",
        label: `Handle: ${ev.label?.trim() || "exception"}`,
        ...(end.pool ? { pool: end.pool } : {}),
        ...(end.lane ? { lane: end.lane } : {}),
        ...(end.parentSubprocess ? { parentSubprocess: end.parentSubprocess } : {}),
      });
      addedTasks.push({ eventId: ev.id, eventLabel: ev.label ?? "", taskId, endLabel: end.label ?? "" });
      return [{ ...c, targetId: taskId }, { sourceId: taskId, targetId: end.id, type: "sequence" }];
    });
  }
  const all = [...elements, ...newElements];
  const typeOf = new Map(all.map((e) => [e.id, e.type]));

  // R8.48 — every End Event that finishes an exception path is a Terminate End Event.
  const edges = conns.filter(isSequence).map((c) => ({ from: c.sourceId, to: c.targetId }));
  const ends = new Set<string>();
  for (const ev of emies) for (const id of exceptionPath(ev.id, edges)) if (typeOf.get(id) === "end-event") ends.add(id);
  const terminated: SilentFailureResult["terminated"] = [];
  const out = all.map((e) => {
    if (!ends.has(e.id) || e.eventType === "terminate") return e;
    terminated.push({ id: e.id, label: e.label ?? "" });
    return { ...e, eventType: "terminate" };
  });

  return { elements: out, connections: conns, addedTasks, terminated };
}
