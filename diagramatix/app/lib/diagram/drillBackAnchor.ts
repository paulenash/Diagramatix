/**
 * Which element carries the "back" marker on a drilled-into diagram.
 *
 * This was a type test — `start-event || initial-state` — written out at both of
 * Canvas's render paths. Two problems came out of that. An EPC has neither of
 * those types, so a drilled-into EPC offered no way back at all; and a type list
 * in two places is one edit away from the marker appearing in one render path
 * and not the other, which is a bug nobody reports because it works right up
 * until the element happens to be selected.
 *
 * So it is ONE decision, and a pure function rather than a closure inside the
 * component — the rule is worth testing, and a rule you cannot call is a rule
 * you can only assert the source text of.
 */
import type { DiagramElement, Connector, DiagramType } from "./types";

/** The EPC types that carry control flow — the spine. */
const EPC_FLOW_TYPES = new Set<string>([
  "epc-event", "epc-function", "epc-xor", "epc-and", "epc-or", "epc-interface",
]);

/** Top-left first, so the marker lands where a reader's eye already is. */
const byTopLeft = (a: DiagramElement, b: DiagramElement) => (a.y - b.y) || (a.x - b.x);

export function findDrillBackAnchor(
  elements: DiagramElement[],
  connectors: Connector[],
  diagramType: DiagramType | string | undefined,
): string | null {
  const els = elements ?? [];

  // A notation with a dedicated start symbol says so outright. A boundary event
  // is mounted on something else and is never where a process begins.
  const explicit = els
    .filter((e) => (e.type === "start-event" || e.type === "initial-state") && !e.boundaryHostId)
    .sort(byTopLeft);
  if (explicit.length) return explicit[0].id;

  if (diagramType === "epc") {
    // An EPC has no start symbol: the chain begins at the event nothing flows
    // INTO. Only control flow counts — an assignment arc into a function does
    // not stop it being the start of anything.
    const hasInbound = new Set(
      (connectors ?? [])
        .filter((c) => c.type === "epc-control-flow")
        .map((c) => c.targetId),
    );
    const starts = els
      .filter((e) => EPC_FLOW_TYPES.has(e.type) && !hasInbound.has(e.id))
      .sort(byTopLeft);
    if (starts.length) return starts[0].id;

    // A chain that is entirely a cycle has no start. Offer the top-left flow
    // element rather than leaving the reader with no way out of the diagram.
    const any = els.filter((e) => EPC_FLOW_TYPES.has(e.type)).sort(byTopLeft);
    return any[0]?.id ?? null;
  }

  return null;
}
