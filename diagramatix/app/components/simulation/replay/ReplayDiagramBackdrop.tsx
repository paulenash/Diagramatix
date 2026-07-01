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
import { ConnectorRenderer } from "@/app/components/canvas/ConnectorRenderer";

const noop = () => {};

/** parentId depth, so containers layer correctly (pool behind lane behind sub-lane). */
function depthOf(el: DiagramElement, byId: Map<string, DiagramElement>): number {
  let d = 0, cur: DiagramElement | undefined = el;
  while (cur?.parentId && d < 16) { cur = byId.get(cur.parentId); d++; }
  return d;
}

const CONTAINER = new Set(["pool", "lane"]);

export const ReplayDiagramBackdrop = memo(function ReplayDiagramBackdrop({ data }: { data: DiagramData }) {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const containers = data.elements.filter((e) => CONTAINER.has(e.type)).sort((a, b) => depthOf(a, byId) - depthOf(b, byId));
  const others = data.elements.filter((e) => !CONTAINER.has(e.type));

  const sym = (el: DiagramElement) => (
    <SymbolRenderer
      key={el.id}
      element={el}
      selected={false}
      isDropTarget={false}
      showConnectionPoints={false}
      onSelect={noop}
      onMove={noop}
      onDoubleClick={noop}
      onConnectionPointDragStart={noop}
    />
  );

  return (
    <g style={{ pointerEvents: "none" }}>
      {/* pools + lanes (background), then connectors, then the flow shapes on top */}
      {containers.map(sym)}
      {data.connectors.map((c) => <ConnectorRenderer key={c.id} connector={c} selected={false} onSelect={noop} />)}
      {others.map(sym)}
    </g>
  );
});
