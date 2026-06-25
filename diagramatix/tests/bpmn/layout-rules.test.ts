/**
 * BPMN code-enforced layout rules — behavioural registry (Tier-1 "B").
 *
 * The red ("code-backed") BPMN rules are a PROMISE that the layout engine
 * enforces a geometric invariant. This file makes that promise executable: a
 * single registry of rules, each carrying a `check()` that drives the real
 * `layoutBpmnDiagram` and asserts the invariant on the output. A meta-test pins
 * the registry — every entry must carry a check, so a new code-enforced rule
 * can't be added without proof, and a refactor that breaks a rule fails its
 * named test. Add a rule here whenever you add a red layout rule in
 * bpmnLayout.ts (R5.09, R8.04, R8.11/12, …).
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections);

type LayoutRule = { id: string; title: string; check: () => void };

const BPMN_LAYOUT_RULES: LayoutRule[] = [
  {
    id: "R5.09",
    title: "gateway labels sit top-left of the diamond, never on the right",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "Start" },
          { id: "g", type: "gateway", label: "Approved?" },
          { id: "a", type: "task", label: "Ship" },
          { id: "b", type: "task", label: "Reject" },
          { id: "e1", type: "end-event", label: "Done" },
          { id: "e2", type: "end-event", label: "Stop" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "a", label: "Yes" },
          { sourceId: "g", targetId: "b", label: "No" },
          { sourceId: "a", targetId: "e1" },
          { sourceId: "b", targetId: "e2" },
        ],
      );
      const g = out.elements.find((e) => e.id === "g")!;
      const ox = (g.properties?.labelOffsetX as number) ?? 0;
      const oy = (g.properties?.labelOffsetY as number) ?? 0;
      // The label centre is left of the gateway centre (R5.09 never places it
      // on the right) and above it (top-left placement for a clear gateway).
      expect(ox, "gateway label should sit LEFT of the diamond").toBeLessThan(0);
      expect(oy, "gateway label should sit ABOVE the diamond").toBeLessThan(0);
    },
  },
  {
    id: "R8.04",
    title: "right-to-left loop-back flows route via top/bottom, never the left face",
    check: () => {
      const out = layout(
        [
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
        ],
        [
          { sourceId: "a", targetId: "b" },
          { sourceId: "b", targetId: "c" },
          { sourceId: "c", targetId: "a", label: "rework" }, // backward edge
        ],
      );
      const back = out.connectors.find((c) => c.sourceId === "c" && c.targetId === "a")!;
      expect(["top", "bottom"], `source side was ${back.sourceSide}`).toContain(back.sourceSide);
      expect(["top", "bottom"], `target side was ${back.targetSide}`).toContain(back.targetSide);
    },
  },
  {
    id: "R8.11",
    title: "sequence connectors on the same element+face never share a connection point",
    check: () => {
      const out = layout(
        [
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
          { id: "c", type: "task", label: "C" },
        ],
        [
          { sourceId: "a", targetId: "c" },
          { sourceId: "b", targetId: "c" }, // two flows converge on C
        ],
      );
      const into = out.connectors.filter((c) => c.targetId === "c");
      // No two incoming flows may share the SAME (face, offset) attachment point.
      const points = into.map((c) => `${c.targetSide}:${(c.targetOffsetAlong ?? 0.5).toFixed(3)}`);
      expect(new Set(points).size, `shared attachment point(s): ${points.join(", ")}`).toBe(points.length);
    },
  },
];

describe("BPMN layout rules (code-enforced)", () => {
  it("registry is pinned — every rule has a unique id and an executable check", () => {
    const ids = BPMN_LAYOUT_RULES.map((r) => r.id);
    expect(new Set(ids).size, "duplicate rule id in registry").toBe(ids.length);
    for (const r of BPMN_LAYOUT_RULES) {
      expect(typeof r.check, `${r.id} has no executable check`).toBe("function");
      expect(r.title.trim().length, `${r.id} needs a title`).toBeGreaterThan(0);
    }
  });

  // One behavioural proof per registered rule.
  for (const r of BPMN_LAYOUT_RULES) {
    it(`${r.id} — ${r.title}`, () => r.check());
  }
});
