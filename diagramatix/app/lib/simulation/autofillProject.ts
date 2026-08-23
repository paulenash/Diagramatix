/**
 * Fill missing simulation values across a process AND every diagram it links
 * into — the whole drill-down tree, not just the one on screen.
 *
 * A run splices linked sub-processes in, so their tasks are real work in the
 * result. Filling only the open diagram left every level below it empty, and the
 * assembler then silently substituted its own defaults: the deeper the process,
 * the more of the answer came from values the user could not see. Opening each
 * child by hand to fill it is not a reasonable thing to ask.
 *
 * A linked child's START event is a pass-through, not an arrival: the parent's
 * token enters the child, nothing new is generated. So it is filled as a fixed
 * ZERO delay rather than given an arrival rate, which is what it means and what
 * a user would otherwise have to set on every child by hand.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { getSimParams, type ElementSimParams } from "@/app/lib/diagram/simParams";
import { autofillSimulation } from "./autofill";
import { isInsideExpandedSubprocess } from "./arrivalSources";

export interface ProjectFillResult {
  /** diagram id → its filled data, for every diagram that CHANGED. */
  changed: Map<string, DiagramData>;
  /** Total values written across the tree. */
  filled: number;
}

/** Diagram ids this diagram links into (collapsed sub-processes with a child). */
export function linkedChildIds(data: DiagramData): string[] {
  const out: string[] = [];
  for (const el of data.elements ?? []) {
    const link = el.properties?.linkedDiagramId;
    if (typeof link === "string" && link) out.push(link);
  }
  return out;
}

/**
 * Start events that are ENTERED rather than triggered, given a fixed zero so the
 * model states what the engine already does (assemble.ts turns both into a
 * pass-through delay). Two kinds:
 *
 *  - a linked CHILD diagram's top-level start — the parent's token enters it;
 *  - any start inside an EXPANDED subprocess, at any level INCLUDING the root —
 *    the EP body is entered by a token that already exists.
 *
 * The second was left blank before. It is not an arrival, so nothing filled it,
 * and it read as a value the user was expected to supply — when there is nothing
 * to supply. Saying "fixed 0" is the difference between a gap and an answer.
 *
 * A start inside an EVENT subprocess is excluded: that one is a trigger with its
 * own timer/error/message semantics, not a pass-through.
 */
function zeroStartEvents(data: DiagramData, isChild: boolean): { data: DiagramData; filled: number } {
  let filled = 0;
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const elements = data.elements.map((el: DiagramElement) => {
    if (el.type !== "start-event" || el.boundaryHostId) return el;
    const inEp = isInsideExpandedSubprocess(el, byId);
    if (!inEp && !isChild) return el;                          // a real arrival source — leave it alone
    if (inEp && isInsideEventSubprocess(el, byId)) return el;  // a trigger, not a pass-through
    const sim: ElementSimParams = { ...getSimParams(el) };
    if (sim.arrival) return el;                                // never overwrite what is already there
    const auto = new Set(sim.autofilled ?? []);
    sim.arrival = { kind: "fixed", value: 0 };
    auto.add("arrival");
    sim.autofilled = [...auto];
    filled++;
    return { ...el, properties: { ...el.properties, sim } };
  });
  return { data: filled ? { ...data, elements } : data, filled };
}

/** Is the nearest enclosing subprocess an EVENT subprocess? */
function isInsideEventSubprocess(el: DiagramElement, byId: Map<string, DiagramElement>): boolean {
  let cur = el.parentId ? byId.get(el.parentId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === "subprocess-expanded" || cur.type === "subprocess")
      return cur.properties?.subprocessType === "event";
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/**
 * Fill the root and every diagram reachable through its linked sub-processes.
 * Cycle-safe. Returns only what changed, so the caller writes back the minimum.
 */
export function autofillProject(rootId: string, byId: Map<string, DiagramData>): ProjectFillResult {
  const changed = new Map<string, DiagramData>();
  let filled = 0;
  const seen = new Set<string>();
  // [id, isChild] — the root is a real process; everything below it is entered
  // from above, so its start event is a pass-through.
  const queue: [string, boolean][] = [[rootId, false]];

  while (queue.length) {
    const [id, isChild] = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const src = byId.get(id);
    if (!src) continue;

    // Zero the pass-through starts FIRST. The generic fill would otherwise give
    // a child's top-level start an arrival RATE — it looks like a process start
    // when the child is read on its own — and nothing here ever overwrites a
    // value already set, so the pass-through meaning would be lost.
    const zeroed = zeroStartEvents(src, isChild);
    const rest = autofillSimulation(zeroed.data);
    const total = zeroed.filled + rest.filled;
    if (total > 0) { changed.set(id, rest.data); filled += total; }

    for (const child of linkedChildIds(rest.data)) if (!seen.has(child)) queue.push([child, true]);
  }
  return { changed, filled };
}

/**
 * Every diagram in one process tree: the root plus everything it links into,
 * transitively. Cycle-safe.
 *
 * Resource seeding used to harvest from every BPMN diagram in the PROJECT,
 * because that is the list the console already had to hand. A project holds
 * unrelated processes, so opening one of them provisioned teams belonging to all
 * the others — resources the user never referred to, appearing in the library of
 * a process that does not use them. A run only ever splices THIS tree, so this
 * is the set to provision from.
 */
export function reachableDiagramIds(rootId: string, byId: Map<string, DiagramData>): string[] {
  const seen = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = byId.get(id);
    if (d) for (const c of linkedChildIds(d)) if (!seen.has(c)) queue.push(c);
  }
  return [...seen];
}
