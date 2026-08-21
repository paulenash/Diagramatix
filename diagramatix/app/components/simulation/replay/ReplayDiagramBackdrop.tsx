"use client";

/**
 * The ACTUAL diagram rendered read-only as the replay backdrop (instead of the
 * stylised boxes/lines) — real BPMN shapes, pools, lanes and routed sequence
 * connectors, so the tokens animate over the process the user actually drew.
 * Reuses the editor's SymbolRenderer / ConnectorRenderer with every interaction
 * prop stubbed; pointer events are off (it's a backdrop). Rendered inside the
 * replay <svg> at the diagram's own coordinates.
 */
import { memo } from "react";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { SymbolRenderer } from "@/app/components/canvas/SymbolRenderer";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { ConnectorRenderer } from "@/app/components/canvas/ConnectorRenderer";

const noop = () => {};

/** parentId depth, so containers layer correctly (pool behind lane behind sub-lane). */
function depthOf(el: DiagramElement, byId: Map<string, DiagramElement>): number {
  let d = 0, cur: DiagramElement | undefined = el;
  while (cur?.parentId && d < 16) { cur = byId.get(cur.parentId); d++; }
  return d;
}

// Containers render as the background layer (behind the connectors) so the
// sequence flows INSIDE them stay visible. Expanded subprocesses are containers
// too — otherwise their box paints over the connectors drawn within.
const CONTAINER = new Set(["pool", "lane", "subprocess-expanded"]);

// Paint containers back-to-front by BPMN nesting, NOT by parentId depth alone.
// An expanded subprocess is often parented to the POOL (not the lane it visually
// sits in), so parentId depth ties it with the lane — and on a tie the giant
// lane can paint OVER the EP box, hiding it (only its children, drawn last, then
// show). Ranking pool → lane → subprocess guarantees the lane is always behind
// the EP regardless of a stale parent; depth then area break remaining ties.
const CONTAINER_RANK: Record<string, number> = { pool: 0, lane: 1, "subprocess-expanded": 2 };

/** The container elements in back-to-front paint order (pure, so it's unit
 *  testable). Rank pool → lane → subprocess first, then parentId depth, then
 *  larger area behind smaller — so a stale-parented EP never hides behind its
 *  own lane. */
export function orderBackdropContainers(elements: DiagramElement[]): DiagramElement[] {
  const byId = new Map(elements.map((e) => [e.id, e]));
  return elements.filter((e) => CONTAINER.has(e.type)).sort((a, b) =>
    (CONTAINER_RANK[a.type] - CONTAINER_RANK[b.type]) ||
    (depthOf(a, byId) - depthOf(b, byId)) ||
    (b.width * b.height - a.width * a.height) // larger behind smaller
  );
}

export const ReplayDiagramBackdrop = memo(function ReplayDiagramBackdrop({ data, colorConfig, visibleIds, emphasize }: { data: DiagramData; colorConfig?: SymbolColorConfig; visibleIds?: Set<string>; emphasize?: Set<string> }) {
  // Optional progressive-reveal gate (the Animate feature): render only ids in
  // the set. Undefined = render everything (the normal replay backdrop).
  const showEl = (id: string) => !visibleIds || visibleIds.has(id);
  // Optional emphasis (variant/case highlight): render EVERYTHING, but fade the
  // elements/connectors NOT in the set so the highlighted path stands out in
  // context. Undefined = no fading.
  const dim = (id: string) => (emphasize && !emphasize.has(id) ? 0.1 : 1);
  const containers = orderBackdropContainers(data.elements).filter((e) => showEl(e.id));
  const others = data.elements.filter((e) => !CONTAINER.has(e.type) && showEl(e.id));

  const sym = (el: DiagramElement) => (
    <g key={el.id} opacity={dim(el.id)}>
      <SymbolRenderer
        element={el}
        colorConfig={colorConfig}
        selected={false}
        isDropTarget={false}
        showConnectionPoints={false}
        onSelect={noop}
        onMove={noop}
        onDoubleClick={noop}
        onConnectionPointDragStart={noop}
      />
    </g>
  );

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* pools + lanes (background), then connectors, then the flow shapes on top */}
      {containers.map(sym)}
      {data.connectors.filter((c) => showEl(c.id)).map((c) => <g key={c.id} opacity={dim(c.id)}><ConnectorRenderer connector={c} selected={false} onSelect={noop} /></g>)}
      {others.map(sym)}
    </g>
  );
});
