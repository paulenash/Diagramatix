/**
 * Which elements are genuine ARRIVAL SOURCES — the single definition shared by
 * "Fill missing" and the Simulation Data panel, so both agree with the engine.
 *
 * A start event INSIDE an expanded subprocess is not an arrival: the assembler
 * turns it into a pass-through delay (the EP body is entered by a token that
 * already exists, not generated afresh). Giving it an arrival rate invents
 * tokens the run never uses, and shows a phantom row in the Arrivals table.
 * Boundary events aren't arrivals either — they race their host.
 */

import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/** Is this element inside an expanded subprocess (at any depth)? */
export function isInsideExpandedSubprocess(el: DiagramElement, byId: Map<string, DiagramElement>): boolean {
  let cur = el.parentId ? byId.get(el.parentId) : undefined;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.type === "subprocess-expanded") return true;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

/** Does this element generate arriving tokens? */
export function isArrivalSource(el: DiagramElement, byId: Map<string, DiagramElement>): boolean {
  if (el.type !== "start-event") return false;
  if (el.boundaryHostId) return false;            // boundary event — races its host
  return !isInsideExpandedSubprocess(el, byId);   // EP body start → pass-through delay
}

/** The diagram's arrival sources, in element order. */
export function arrivalSourcesOf(data: DiagramData): DiagramElement[] {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  return data.elements.filter((e) => isArrivalSource(e, byId));
}
