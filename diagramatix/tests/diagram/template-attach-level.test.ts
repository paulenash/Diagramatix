/**
 * T4931 — a template attached after a step goes in LEVEL with it, whatever the
 * template.
 *
 * Paul, 2026-09-27 (test-diagram voice-debug session): "the placement of the
 * template using 'add template' is well above the line of the selected
 * element, whereas with 'Assist' turned on and using 'take template' then
 * selecting the template manually the template is placed perfectly." Both use
 * the same attach; the difference was the TEMPLATE. "Dual Approval (two
 * Eyes!)" was planned 410 px above the step, the Rework template level, and
 * the reducer then made room above by pushing the lane's content down — the
 * gap came with it. Two knife-edges, both in the free-slot nudge:
 *   - its lower branch brushed a step in the sub-lane BELOW by half a pixel —
 *     but that lane is pushed down when the template's lane grows, so it is
 *     never in the way;
 *   - the step it follows sits EXACTLY one clearance from the entry by rule
 *     1, and floating-point rounding decided whether that "touched".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { planTemplateAttach, checkTemplateAttach } from "@/app/lib/diagram/templateAttach";
import { reducer, healOnLoad } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement, TemplateData } from "@/app/lib/diagram/types";

const fixture = JSON.parse(readFileSync("tests/fixtures/voice-debug/test-diagram-template-level.json", "utf8")) as {
  diagram: DiagramData;
  templates: { dualApproval: TemplateData; rework: TemplateData };
};
const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const cy = (e: DiagramElement) => e.y + e.height / 2;

function attach(base: DiagramData, t: TemplateData, anchorId: string) {
  const plan = planTemplateAttach(t, anchorId, base);
  if ("error" in plan) throw new Error(plan.error);
  expect("error" in checkTemplateAttach(base, plan)).toBe(false);
  const after = reducer(base, { type: "APPLY_TEMPLATE", payload: { elements: plan.elements, connectors: plan.connectors, join: plan.join } } as never);
  return { plan, after };
}

describe("T4931 — a template goes in level with the step it follows, whatever the template", () => {
  const base = healOnLoad(fixture.diagram);
  const anchor = base.elements.find((e) => e.label === "Approve Claim")!;

  it("Paul's diagram: Dual Approval and the Rework template are planned the same way — ½ Task right, centres level", () => {
    for (const [name, t] of Object.entries(fixture.templates)) {
      const { plan } = attach(base, t, anchor.id);
      const entry = plan.elements.find((e) => e.id === plan.join.targetId)!;
      expect(entry.x, name).toBeCloseTo(anchor.x + anchor.width + 51, 0);
      expect(cy(entry), name).toBeCloseTo(cy(anchor), 0);
    }
  });

  it("…and after the lane settles, the entry is still level with the step (the Dual Approval gap was 410 px)", () => {
    for (const [name, t] of Object.entries(fixture.templates)) {
      const { plan, after } = attach(base, t, anchor.id);
      const a = after.elements.find((e) => e.id === anchor.id)!;
      const entry = after.elements.find((e) => e.id === plan.join.targetId)!;
      expect(Math.abs(cy(entry) - cy(a)), name).toBeLessThan(2);
      expect(a.y - anchor.y, `${name}: the step moves only by what the lane's top growth carries`).toBeLessThan(60);
    }
  });

  // Synthetic: one lane with two sub-lanes; the step to follow in the top one.
  const world = (): DiagramData => ({
    elements: [
      E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1400, height: 400, properties: { poolType: "white-box" } }),
      E({ id: "L", type: "lane", label: "Team", x: 36, y: 0, width: 1364, height: 400, parentId: "P", properties: {} }),
      E({ id: "S1", type: "lane", label: "Upper", x: 72, y: 0, width: 1328, height: 200, parentId: "L", properties: {} }),
      E({ id: "S2", type: "lane", label: "Lower", x: 72, y: 200, width: 1328, height: 200, parentId: "L", properties: {} }),
      E({ id: "a", type: "task", label: "Do It", x: 150, y: 60, width: 102, height: 64, parentId: "S1", properties: {} }),
      // Just below where a two-row template's lower branch will reach.
      E({ id: "b", type: "task", label: "Below", x: 500, y: 210, width: 102, height: 64, parentId: "S2", properties: {} }),
    ],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData);
  const twoRows = (): TemplateData => ({
    elements: [
      E({ id: "t1", type: "task", label: "First", x: 0, y: 0, width: 102, height: 64, properties: {} }),
      E({ id: "t2", type: "task", label: "Lower Branch", x: 150, y: 110, width: 102, height: 64, properties: {} }),
    ],
    connectors: [{ id: "tc", sourceId: "t1", targetId: "t2", type: "sequence", sourceSide: "right", targetSide: "left", directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] }],
  } as unknown as TemplateData);

  it("content in ANOTHER lane is never in the way — that lane is pushed down as the template's lane grows", () => {
    const { plan } = attach(world(), twoRows(), "a");
    const entry = plan.elements.find((e) => e.id === plan.join.targetId)!;
    expect(entry.x).toBeCloseTo(150 + 102 + 51, 0);
    expect(cy(entry)).toBeCloseTo(92, 0);
  });

  it("content in the SAME lane still is — the template steps round it", () => {
    const d = world();
    d.elements.push(E({ id: "c", type: "task", label: "In The Way", x: 320, y: 60, width: 102, height: 64, parentId: "S1", properties: {} }));
    const { plan } = attach(d, twoRows(), "a");
    const entry = plan.elements.find((e) => e.id === plan.join.targetId)!;
    expect(entry.x === 150 + 102 + 51 && cy(entry) === 92, "not left on top of “In The Way”").toBe(false);
  });

  it("wiring: the attach tells the nudge what it is joined to, and the nudge counts only its own band", () => {
    const src = readFileSync("app/lib/diagram/templateAttach.ts", "utf8");
    expect(src).toContain("const joinedTo = new Set([anchor.id, ...(anchor.boundaryHostId ? [anchor.boundaryHostId] : [])]);");
    expect(src).toContain(".filter((e) => (!inBand || inBand.has(e.id)) && !joinedTo.has(e.id))");
  });
});
