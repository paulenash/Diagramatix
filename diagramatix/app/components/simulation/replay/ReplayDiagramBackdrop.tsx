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

// Containers render as the background layer (behind the connectors) so the
// sequence flows INSIDE them stay visible. Expanded subprocesses are containers
// too — otherwise their box paints over the connectors drawn within.
const CONTAINER = new Set(["pool", "lane", "subprocess-expanded"]);

export const ReplayDiagramBackdrop = memo(function ReplayDiagramBackdrop({ data, visibleIds, emphasize }: { data: DiagramData; visibleIds?: Set<string>; emphasize?: Set<string> }) {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  // Optional progressive-reveal gate (the Animate feature): render only ids in
  // the set. Undefined = render everything (the normal replay backdrop).
  const showEl = (id: string) => !visibleIds || visibleIds.has(id);
  // Optional emphasis (variant/case highlight): render EVERYTHING, but fade the
  // elements/connectors NOT in the set so the highlighted path stands out in
  // context. Undefined = no fading.
  const dim = (id: string) => (emphasize && !emphasize.has(id) ? 0.1 : 1);
  const containers = data.elements.filter((e) => CONTAINER.has(e.type) && showEl(e.id)).sort((a, b) => depthOf(a, byId) - depthOf(b, byId));
  const others = data.elements.filter((e) => !CONTAINER.has(e.type) && showEl(e.id) && !e.boundaryHostId);
  // Boundary events (mounted on a task / EP rim) render LAST — on top of their
  // host and everything else — so a container fill or sibling can never paint
  // over them (they were being lost on an EP with boundary events on its edge).
  const boundaryEvents = data.elements.filter((e) => !CONTAINER.has(e.type) && showEl(e.id) && !!e.boundaryHostId);

  // Boundary events are drawn EXPLICITLY (not via SymbolRenderer, which — for
  // reasons that don't reproduce in code — renders nothing for a boundary event
  // in this backdrop context). A plain BPMN event glyph guarantees they show on
  // the replay: a white circle (double ring for intermediate) + a timer/error
  // mark + its label. (Paul: "find all EP boundaries and render them.")
  const boundaryGlyph = (el: DiagramElement) => {
    const cx = el.x + el.width / 2, cy = el.y + el.height / 2;
    const r = Math.min(el.width, el.height) / 2;
    const isEnd = el.type === "end-event";
    const isInter = el.type === "intermediate-event";
    const label = (el.label || "").split("\n")[0];
    return (
      <g key={el.id} opacity={dim(el.id)} style={{ pointerEvents: "none" }}>
        <circle cx={cx} cy={cy} r={r} fill="#ffffff" stroke="#111827" strokeWidth={isEnd ? 3 : 1.6} />
        {isInter && <circle cx={cx} cy={cy} r={r - 3} fill="none" stroke="#111827" strokeWidth={1} />}
        {el.eventType === "timer" && (
          <g stroke="#111827" strokeWidth={1.2} strokeLinecap="round">
            <line x1={cx} y1={cy} x2={cx} y2={cy - r * 0.5} />
            <line x1={cx} y1={cy} x2={cx + r * 0.42} y2={cy} />
          </g>
        )}
        {el.eventType === "error" && (
          <path d={`M ${cx - r * 0.4} ${cy + r * 0.4} L ${cx + r * 0.05} ${cy - r * 0.02} L ${cx - r * 0.12} ${cy} L ${cx + r * 0.4} ${cy - r * 0.4}`}
            fill="none" stroke="#111827" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
        )}
        {label && <text x={cx} y={cy + r + 11} textAnchor="middle" fontSize={9} fill="#cbd5e1" fontFamily="sans-serif">{label}</text>}
      </g>
    );
  };

  const sym = (el: DiagramElement) => (
    <g key={el.id} opacity={dim(el.id)}>
      <SymbolRenderer
        element={el}
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
      {boundaryEvents.map(boundaryGlyph)}
    </g>
  );
});
