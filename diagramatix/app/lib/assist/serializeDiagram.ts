/**
 * Compact, token-cheap serialization of the current diagram so the AI command
 * interpreter can resolve references ("after Review", "the gateway") to the real
 * elements. Ids + types + labels + parent + connections only — no geometry.
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

export function serializeDiagramForCommand(data: DiagramData, selectedIds?: readonly string[]): string {
  const selected = new Set(selectedIds ?? []);
  const els = data.elements.map((e) => elLine(e, selected.has(e.id))).join("\n") || "(none)";
  const cons = data.connectors
    .map((c) => `${c.sourceId} -> ${c.targetId}${c.type && c.type !== "sequence" ? ` (${c.type})` : ""}`)
    .join("\n") || "(none)";
  return `ELEMENTS (id [type] "label"):\n${els}\n\nCONNECTORS (source -> target):\n${cons}`;
}
