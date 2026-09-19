/**
 * Compact, token-cheap serialization of the current diagram so the AI command
 * interpreter can resolve references ("after Review", "the gateway") to the real
 * elements. Ids + types + labels + parent + connections only — no geometry.
 *
 * CAPPED (Paul, 2026-09-20 — plan item R4). It used to send the WHOLE diagram on
 * every fallback call, with no limit: a 600-element process map went down the
 * wire each time somebody said something the grammar did not recognise. The cap
 * keeps that bounded.
 *
 * What survives the cap, in order:
 *   1. everything the user has SELECTED — those are the referents for "the
 *      selected task" / "these", so dropping one would break the very command
 *      being interpreted;
 *   2. the rest, in document order, until the budget runs out.
 *
 * A connector is only sent when BOTH its ends survived. One pointing at an
 * element the model cannot see is worse than absent — it invites an op against
 * an id that is not in the list. The count of what was left out is stated, so
 * the model knows the picture is partial rather than assuming it is complete.
 */
import type { DiagramData, DiagramElement } from "../diagram/types";

function elLine(e: DiagramElement, selected: boolean): string {
  const sub =
    e.type === "gateway" && e.gatewayType && e.gatewayType !== "none" ? `/${e.gatewayType}` :
    (e.type === "intermediate-event" || e.type === "start-event" || e.type === "end-event") && e.eventType && e.eventType !== "none" ? `/${e.eventType}` :
    "";
  const parent = e.parentId ? ` @${e.parentId}` : "";
  const host = e.boundaryHostId ? ` boundaryOf:${e.boundaryHostId}` : "";
  // The user's mouse selection travels with the diagram so "this" / "the
  // selected task" can be kept as-is in the canonical rewrite.
  const sel = selected ? " [selected]" : "";
  return `${e.id} [${e.type}${sub}] "${(e.label ?? "").replace(/"/g, "'")}"${parent}${host}${sel}`;
}

/** How many elements one fallback call may describe. Generous — the grammar
 *  handles the everyday commands, so the AI only ever sees the awkward ones. */
export const COMMAND_SERIALISE_MAX = 120;

export function serializeDiagramForCommand(
  data: DiagramData,
  selectedIds?: readonly string[],
  max: number = COMMAND_SERIALISE_MAX,
): string {
  const selected = new Set(selectedIds ?? []);
  // Selected first, then the rest in document order, and only then trim — so a
  // selection at the far end of a big diagram is never the thing that is cut.
  const picked: DiagramElement[] = [];
  const seen = new Set<string>();
  for (const e of data.elements) {
    if (!selected.has(e.id)) continue;
    picked.push(e); seen.add(e.id);
  }
  for (const e of data.elements) {
    if (picked.length >= max) break;
    if (seen.has(e.id)) continue;
    picked.push(e); seen.add(e.id);
  }
  const omittedEls = data.elements.length - picked.length;

  const kept = new Set(picked.map((e) => e.id));
  const conns = data.connectors.filter((c) => kept.has(c.sourceId) && kept.has(c.targetId));
  const omittedConns = data.connectors.length - conns.length;

  const els = picked.map((e) => elLine(e, selected.has(e.id))).join("\n") || "(none)";
  const cons = conns
    .map((c) => `${c.sourceId} -> ${c.targetId}${c.type && c.type !== "sequence" ? ` (${c.type})` : ""}`)
    .join("\n") || "(none)";
  const note = omittedEls > 0 || omittedConns > 0
    ? `\n\n(This is part of a larger diagram: ${omittedEls} more element${omittedEls === 1 ? "" : "s"}`
      + ` and ${omittedConns} more connector${omittedConns === 1 ? "" : "s"} are not shown.`
      + ` Only act on what is listed.)`
    : "";
  return `ELEMENTS (id [type] "label"):\n${els}\n\nCONNECTORS (source -> target):\n${cons}${note}`;
}
