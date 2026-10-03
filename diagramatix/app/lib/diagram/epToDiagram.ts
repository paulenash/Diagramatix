/**
 * "Collapse this subprocess to a new diagram" — what goes INTO the new diagram (Paul, 2026-10-03).
 *
 * The expanded subprocess's interior is moved to a brand-new BPMN diagram, and the subprocess itself becomes a
 * collapsed one linked to it (the CONVERT_EP_TO_SUBPROCESS reducer does the canvas side). The new diagram holds:
 *   • ONE white-box pool with no lanes and the default name, around everything that moved;
 *   • the main flow — everything else — laid out as if the Event EPs were not there, keeping its relative position, at
 *     the top left of the pool;
 *   • any Event expanded subprocesses that sat directly in the original EP, stacked one under another UNDER the main
 *     flow, left-justified, in their original top-to-bottom order; the pool grows downwards to hold them.
 *
 * Pure. The diagram's NAME is the EP's name, made unique in its project with " (n)" (`uniqueDiagramName`).
 */
import type { Connector, DiagramData, DiagramElement } from "./types";
import { captureTemplate } from "./templates";
import { getAllDescendantIds } from "./containment";
import { getPoolHeaderWidth } from "./containerMetrics";
import { recomputeAllConnectors } from "./routing";

export const COLLAPSED_POOL_NAME = "Pool 1";
const PAD = 30;
const GAP = 30;

/** What leaves the canvas: everything under the EP except boundary Intermediate events (they stay on the collapsed box). */
export function movedIdsForCollapse(elements: readonly DiagramElement[], epId: string): Set<string> {
  const desc = getAllDescendantIds(elements as DiagramElement[], epId);
  const byId = new Map(elements.map((e) => [e.id, e] as const));
  return new Set([...desc].filter((d) => {
    const e = byId.get(d);
    return !(e && e.boundaryHostId === epId && e.type === "intermediate-event");
  }));
}

/** "Review" → "Review", or "Review (2)", "Review (3)" … when that name is taken (case-insensitive). */
export function uniqueDiagramName(base: string, taken: readonly string[]): string {
  const name = base.trim() || "Subprocess";
  const used = new Set(taken.map((t) => t.trim().toLowerCase()));
  if (!used.has(name.toLowerCase())) return name;
  for (let n = 2; n < 10000; n++) if (!used.has(`${name} (${n})`.toLowerCase())) return `${name} (${n})`;
  return `${name} (${taken.length + 2})`;
}

const isEventEp = (e: DiagramElement) => e.type === "subprocess-expanded" && e.properties?.subprocessType === "event";

/** The diagram data for the new (linked) diagram, or null when nothing moves. `base` carries the source diagram's settings. */
export function buildCollapsedEpDiagram(base: DiagramData, epId: string): DiagramData | null {
  const ep = base.elements.find((e) => e.id === epId);
  if (!ep || ep.type !== "subprocess-expanded") return null;
  const moved = movedIdsForCollapse(base.elements, epId);
  if (moved.size === 0) return null;
  const captured = captureTemplate(base.elements, base.connectors, moved);
  let elements: DiagramElement[] = captured.elements.map((e) => ({ ...e }));
  const byId = () => new Map(elements.map((e) => [e.id, e] as const));
  const descOf = (id: string) => getAllDescendantIds(elements, id);

  const pool: DiagramElement = {
    id: `pool-${epId}`.replace(/[^A-Za-z0-9_-]/g, ""),
    type: "pool", x: 0, y: 0, width: 400, height: 200, label: COLLAPSED_POOL_NAME,
    properties: { poolType: "white-box" },
  } as DiagramElement;
  const left = getPoolHeaderWidth(pool) + PAD;

  const shift = (id: string, dx: number, dy: number) => {
    const ids = new Set([id, ...descOf(id)]);
    elements = elements.map((e) => (ids.has(e.id) ? { ...e, x: e.x + dx, y: e.y + dy } : e));
  };

  // The top level: what sat directly in the EP (no parent left once the EP is not part of the capture).
  const top = elements.filter((e) => !e.parentId && !e.boundaryHostId);
  const eventEps = top.filter(isEventEp).sort((a, b) => a.y - b.y || a.x - b.x);
  const rest = top.filter((e) => !isEventEp(e));

  // The main flow first, laid out as if the Event EPs were not there: everything else keeps its relative position, at the
  // top left of the pool.
  let y = PAD;
  if (rest.length) {
    const minX = Math.min(...rest.map((e) => byId().get(e.id)!.x));
    const minY = Math.min(...rest.map((e) => byId().get(e.id)!.y));
    for (const e of rest) shift(e.id, left - minX, PAD - minY);
    y = Math.max(...rest.map((e) => { const c = byId().get(e.id)!; return c.y + c.height; })) + GAP;
  }
  // Then the pool grows DOWNWARDS to take the Event EPs UNDER the main flow: one under another, left-justified, in their
  // original top-to-bottom order (Paul, 2026-10-03: "grow the new pool downwards to accommodate it under the main flow").
  for (const e of eventEps) {
    const cur = byId().get(e.id)!;
    shift(e.id, left - cur.x, y - cur.y);
    y += cur.height + GAP;
  }

  // The pool round the lot; every top-level element belongs to it (a pool with no lanes).
  const right = Math.max(...elements.map((e) => e.x + e.width));
  const bottom = Math.max(...elements.map((e) => e.y + e.height));
  const sized = { ...pool, width: Math.max(400, Math.round(right + PAD)), height: Math.max(200, Math.round(bottom + PAD)) };
  const topIds = new Set(top.map((e) => e.id));
  elements = [sized, ...elements.map((e) => (topIds.has(e.id) ? { ...e, parentId: sized.id } : e))];

  const connectors: Connector[] = recomputeAllConnectors(captured.connectors.map((c) => ({ ...c })), elements, base.relaxedLayout);
  return { ...base, elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } };
}
