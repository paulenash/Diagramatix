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
  /**
   * SUPERSEDED, 2026-09-04. R6.27 assigned these round-robin by target Y —
   * top, right, bottom, top, right — which put the FOURTH branch, below the
   * gateway, on the TOP vertex. Paul reported exactly that on V22.04's "Which
   * handling indicators apply?": "the connection points do not follow the path
   * order as I expected ... Task 'Flag claim for specialist involvement' should
   * be connected to the bottom vertices."
   *
   * R6.33 assigns by where the target actually IS — above → top, level → right,
   * below → bottom — so no branch ever leaves by the vertex facing away from it.
   * With five branches and three outbound vertices some must double up; they
   * double on the side they genuinely point at, which is what B49 has always
   * permitted for four or more.
   */
  it("T2830 — a 5-branch decision leaves by the vertex facing its target (R6.33)", () => {
    const o = out();
    const cy = (id: string) => { const e = o.elements.find((x) => x.id === id)!; return e.y + e.height / 2; };
    const g = o.elements.find((x) => x.id === "g")!;
    const gcy = g.y + g.height / 2;
    const rows = o.connectors
      .filter((c) => c.sourceId === "g")
      .map((c) => ({ side: c.sourceSide, y: cy(c.targetId) }))
      .sort((a, b) => a.y - b.y);
    expect(rows.map((x) => x.side)).toEqual(["top", "right", "right", "bottom", "bottom"]);
    // The property that matters, stated independently of the exact fan: nothing
    // above the gateway leaves by `bottom`, and nothing below leaves by `top`.
    for (const r of rows) {
      if (r.y < gcy - 26) expect(r.side, "a branch above must not leave by the bottom").not.toBe("bottom");
      if (r.y > gcy + 26) expect(r.side, "a branch below must not leave by the top").not.toBe("top");
    }
  });

  /**
   * SUPERSEDED, 2026-09-05, for the same reason as its outbound twin above.
   * R6.28 assigned these round-robin by source Y — top, left, bottom, top, left
   * — which brought the FOURTH branch, arriving from below, in at the TOP vertex.
   * Paul reported exactly that on V22.05's merge: "a task lower than the merge is
   * connected to the top merge vertex, and a task above the merge is connected to
   * the bottom vertex."
   *
   * R6.34 assigns by where the source actually IS — above → top, level → left,
   * below → bottom — so nothing arrives by the vertex facing away from it.
   */
  it("T2830 — a 5-branch merge is entered by the vertex facing its source (R6.34)", () => {
    const o = out();
    const cy = (id: string) => { const e = o.elements.find((x) => x.id === id)!; return e.y + e.height / 2; };
    const m = o.elements.find((x) => x.id === "m")!;
    const mcy = m.y + m.height / 2;
    const rows = o.connectors
      .filter((c) => c.targetId === "m")
      .map((c) => ({ side: c.targetSide, y: cy(c.sourceId) }))
      .sort((a, b) => a.y - b.y);
    expect(rows.map((x) => x.side)).toEqual(["top", "left", "left", "bottom", "bottom"]);
    // The property that survives any fan: nothing from above enters at the
    // bottom, nothing from below enters at the top.
    for (const r of rows) {
      if (r.y < mcy - 26) expect(r.side, "an arrival from above must not enter at the bottom").not.toBe("bottom");
      if (r.y > mcy + 26) expect(r.side, "an arrival from below must not enter at the top").not.toBe("top");
    }
  });
});
