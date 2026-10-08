/**
 * T5280 — R8.46 (Paul, 2026-10-07): a gateway's outgoing branch labels sit 50 px along the connector from the gateway vertex;
 * a top/bottom-vertex label has its left edge 30 px right of that point, a middle-vertex label its bottom edge 30 px above it;
 * labels of one gateway that then overlap are nudged apart (top one up, bottom one down).
 *
 * The rule's spot is taken only where it adds no readability violation (a long label beside a close target would sit on the next task);
 * otherwise the label keeps the place the earlier passes gave it. So the tests pin: the constants, the geometry helpers, that the rule
 * is what places the labels where it can (a large share of the corpus lands exactly on it), the nudge on a constructed gateway, and
 * that the layout-corpus ratchet does not move (tests/bpmn/layout-corpus.test.ts).
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { connectorLabelBox } from "@/app/lib/diagram/checks/layoutViolations";
import {
  GATEWAY_LABEL_ALONG_OFFSET, GATEWAY_LABEL_CLEAR_OFFSET, GATEWAY_LABEL_UP_OFFSET, branchRole, placeGatewayBranchLabels, pointAlong, ruleLabelBox,
} from "@/app/lib/diagram/gatewayBranchLabels";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const dir = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const plans = readdirSync(dir).filter((f) => f.endsWith(".plan.json")).sort().map((f) => {
  const j = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
  return j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
});

describe("T5280 R8.46 gateway branch labels", () => {
  it("the constants are the ones Paul named", () => {
    expect([GATEWAY_LABEL_ALONG_OFFSET, GATEWAY_LABEL_CLEAR_OFFSET, GATEWAY_LABEL_UP_OFFSET]).toEqual([50, 30, 30]);
  });
  it("pointAlong walks the polyline", () => {
    expect(pointAlong([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 40, y: 20 }], 50)).toEqual({ x: 30, y: 20 });
  });
  it("the rule box: top/bottom left edge 30 right of the 50 px point; middle bottom edge 30 above it", () => {
    const gw = { id: "g", type: "gateway", x: 100, y: 100, width: 40, height: 40, label: "", properties: {} } as DiagramElement;
    const mk = (side: string, wp: { x: number; y: number }[]): Connector =>
      ({ id: side, type: "sequence", sourceId: "g", targetId: "t", sourceSide: side, targetSide: "left", label: "Yes", labelAnchor: "source", directionType: "directed", routingType: "rectilinear", waypoints: wp }) as Connector;
    const mid = mk("right", [{ x: 140, y: 120 }, { x: 300, y: 120 }]);
    const top = mk("top", [{ x: 120, y: 100 }, { x: 120, y: 20 }, { x: 300, y: 20 }]);
    const m = ruleLabelBox(mid, [gw])!, t = ruleLabelBox(top, [gw])!;
    expect(m.role).toBe("middle");
    expect(m.box.x).toBeCloseTo(190);                                   // 140 + 50
    expect(m.box.y + m.box.h).toBeCloseTo(120 - GATEWAY_LABEL_UP_OFFSET);
    expect(t.role).toBe("top");
    expect(t.box.x).toBeCloseTo(120 + GATEWAY_LABEL_CLEAR_OFFSET);       // the 50 px point is on the vertical rise (x = 120)
    expect(branchRole(top)).toBe("top");
  });
  it("labels of one gateway that would overlap are pushed apart — the top one up, the bottom one down", () => {
    const gw = { id: "g", type: "gateway", x: 100, y: 100, width: 40, height: 40, label: "", properties: {} } as DiagramElement;
    const mk = (id: string, side: string, wp: { x: number; y: number }[]): Connector =>
      ({ id, type: "sequence", sourceId: "g", targetId: "t", sourceSide: side, targetSide: "left", label: "A long branch label", labelAnchor: "source", directionType: "directed", routingType: "rectilinear", waypoints: wp }) as Connector;
    // top and bottom branches leave 8 px apart vertically at the 50 px mark so their boxes collide unless nudged
    const top = mk("t", "top", [{ x: 120, y: 100 }, { x: 120, y: 40 }, { x: 300, y: 40 }]);
    const bot = mk("b", "bottom", [{ x: 120, y: 140 }, { x: 120, y: 200 }, { x: 300, y: 200 }]);
    const mid = mk("m", "right", [{ x: 140, y: 120 }, { x: 300, y: 120 }]);
    const cs = [top, bot, mid];
    placeGatewayBranchLabels([gw], cs);
    const boxes = cs.map((c) => connectorLabelBox(c, [gw])!);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y).toBe(false);
    }
    expect(boxes[0].y).toBeLessThan(boxes[2].y);   // top above middle
    expect(boxes[1].y).toBeGreaterThan(boxes[2].y); // bottom below middle
  });
  it("across the corpus: about half of all gateway branch labels land exactly on the rule's position", () => {
    let on = 0, all = 0;
    for (const plan of plans) {
      const g = layoutBpmnDiagram(plan.elements, plan.connections);
      for (const c of g.connectors) {
        const s = g.elements.find((e) => e.id === c.sourceId);
        if (s?.type !== "gateway" || c.type !== "sequence" || !(c.label ?? "").trim()) continue;
        const r = ruleLabelBox(c, g.elements), b = connectorLabelBox(c, g.elements);
        if (!r || !b) continue;
        all++;
        if (Math.abs(r.box.x - b.x) < 1.5 && Math.abs(r.box.y - b.y) < 1.5) on++;
      }
    }
    expect(all).toBeGreaterThan(100);
    expect(on / all).toBeGreaterThan(0.4);   // measured 68 of 139 (49%) on 2026-10-07; the rest would have sat on a neighbouring task
  });
  it("R8.46 is in the seeded BPMN rules after R8.45 and in an idempotent patch that says the same thing", () => {
    const seed = readFileSync("scripts/seed-diagram-rules.cjs", "utf8");
    const sql = readFileSync("scripts/sql/patch-rule-r8-46-gateway-branch-labels.sql", "utf8");
    const at = seed.indexOf("R8.46:");
    expect(at).toBeGreaterThan(seed.indexOf("R8.45:"));
    const text = (JSON.parse(`"${seed.slice(at, seed.indexOf('"', at))}"`) as string).split("\nR8.47:")[0];   // R8.47–R8.50 follow in the same string
    expect(sql).toContain(text.trim());
    expect(sql).toContain("AND rules NOT LIKE '%R8.46:%'");
    expect(sql).toContain("LIKE 'Group 8: Auto-Layout Placement%'");
    expect(sql).not.toContain("DELETE FROM");
  });
  it("the rule is named in the layout", () => {
    expect(readFileSync("app/lib/diagram/bpmnLayout.ts", "utf8")).toContain("R8.46");
  });
});
