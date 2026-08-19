/**
 * R6.26–R6.29 — gateway branch connection vertices. Outbound flows from a
 * decision (and inbound flows to a merge) are sorted by the OTHER end's vertical
 * position and assigned the gateway's vertices round-robin in groups of three:
 * decision (R6.27) -> top/right/bottom, merge (R6.28) -> top/left/bottom, repeating for
 * each further group of three so double-ups reuse the same three vertices in
 * vertical order, fanning from the shared vertex (R6.29) (Paul 2026-08-20).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const out = () => {
  const els: AiElement[] = [
    { id: "s", type: "start-event", label: "S" },
    { id: "g", type: "gateway", label: "Pick?", gatewayType: "exclusive" },
    ...[1, 2, 3, 4, 5].map((i) => ({ id: "b" + i, type: "task", label: "Branch " + i } as AiElement)),
    { id: "m", type: "gateway", label: "" },
    { id: "e", type: "end-event", label: "E" },
  ];
  const conns: AiConnection[] = [
    { sourceId: "s", targetId: "g" },
    ...[1, 2, 3, 4, 5].map((i) => ({ sourceId: "g", targetId: "b" + i })),
    ...[1, 2, 3, 4, 5].map((i) => ({ sourceId: "b" + i, targetId: "m" })),
    { sourceId: "m", targetId: "e" },
  ];
  return layoutBpmnDiagram(els, conns);
};

describe("gateway fan connection vertices (R6.26–R6.29)", () => {
  it("T2830 — a 5-branch decision assigns outbound vertices top/right/bottom round-robin by target Y (R6.27)", () => {
    const o = out();
    const cy = (id: string) => { const e = o.elements.find((x) => x.id === id)!; return e.y + e.height / 2; };
    const sides = o.connectors
      .filter((c) => c.sourceId === "g")
      .map((c) => ({ side: c.sourceSide, y: cy(c.targetId) }))
      .sort((a, b) => a.y - b.y)
      .map((x) => x.side);
    expect(sides).toEqual(["top", "right", "bottom", "top", "right"]);
  });

  it("T2830 — a 5-branch merge assigns inbound vertices top/left/bottom round-robin by source Y (R6.28)", () => {
    const o = out();
    const cy = (id: string) => { const e = o.elements.find((x) => x.id === id)!; return e.y + e.height / 2; };
    const sides = o.connectors
      .filter((c) => c.targetId === "m")
      .map((c) => ({ side: c.targetSide, y: cy(c.sourceId) }))
      .sort((a, b) => a.y - b.y)
      .map((x) => x.side);
    expect(sides).toEqual(["top", "left", "bottom", "top", "left"]);
  });
});
