/**
 * BPMN structural / generative layout rules.
 *
 * Companion to layout-rules.test.ts. Those rules pin GEOMETRIC invariants
 * (sides, offsets, positions). These pin GENERATIVE ones — where the layout
 * MAKES the diagram well-formed: injecting a process start/end event, giving a
 * label-less decision a default question, forcing the start event into the top
 * lane, dropping connectors that point at nothing. Same registry + meta-guard
 * shape so a generative rule can't be registered without an executable check.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections);

type StructuralRule = { id: string; title: string; check: () => void };

const BPMN_STRUCTURAL_RULES: StructuralRule[] = [
  {
    id: "R6.13",
    title: "a white-box pool with no start/end event gets a process-level start + end injected",
    check: () => {
      const out = layout(
        [
          { id: "p", type: "pool", label: "Process", poolType: "white-box" },
          { id: "t", type: "task", label: "Only step", pool: "p" },
        ],
        [],
      );
      expect(out.elements.some((e) => e.type === "start-event"), "start event should be injected").toBe(true);
      expect(out.elements.some((e) => e.type === "end-event"), "end event should be injected").toBe(true);
    },
  },
  {
    id: "R6.23",
    title: "a label-less exclusive decision gateway defaults to a \"Decision?\" question",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "g", type: "gateway", label: "" },
          { id: "a", type: "task", label: "A" },
          { id: "b", type: "task", label: "B" },
        ],
        [
          { sourceId: "s", targetId: "g" },
          { sourceId: "g", targetId: "a" },
          { sourceId: "g", targetId: "b" },
        ],
      );
      const g = out.elements.find((e) => e.id === "g")!;
      expect(g.label, `gateway label was "${g.label}"`).toBe("Decision?");
    },
  },
  {
    id: "R3.08",
    title: "a process start event is forced into the pool's topmost lane",
    check: () => {
      const out = layout(
        [
          { id: "p", type: "pool", label: "P", poolType: "white-box", lanes: [{ id: "l1", name: "Top" }, { id: "l2", name: "Bottom" }] },
          { id: "s", type: "start-event", label: "S", pool: "p", lane: "l2" }, // AI placed it in the BOTTOM lane
          { id: "t", type: "task", label: "T", pool: "p", lane: "l2" },
          { id: "e", type: "end-event", label: "E", pool: "p", lane: "l2" },
        ],
        [{ sourceId: "s", targetId: "t" }, { sourceId: "t", targetId: "e" }],
      );
      const s = out.elements.find((e) => e.id === "s")!;
      const lanes = out.elements.filter((e) => e.type === "lane");
      expect(lanes.length, "expected two lanes").toBe(2);
      const topLane = lanes.reduce((m, l) => (l.y < m.y ? l : m));
      const sCy = s.y + s.height / 2;
      expect(sCy, "start event should sit in the TOP lane's band").toBeGreaterThanOrEqual(topLane.y);
      expect(sCy, "start event should sit in the TOP lane's band").toBeLessThanOrEqual(topLane.y + topLane.height);
    },
  },
  {
    id: "R6.12",
    title: "a connector pointing at a non-existent element is dropped",
    check: () => {
      const out = layout(
        [
          { id: "s", type: "start-event", label: "S" },
          { id: "t", type: "task", label: "T" },
          { id: "e", type: "end-event", label: "E" },
        ],
        [
          { sourceId: "s", targetId: "t" },
          { sourceId: "t", targetId: "e" },
          { sourceId: "t", targetId: "ghost" }, // ghost is not an element
        ],
      );
      expect(
        out.connectors.some((c) => c.targetId === "ghost"),
        "a dangling connector should not survive layout",
      ).toBe(false);
    },
  },
];

describe("BPMN structural rules (generative)", () => {
  it("registry is pinned — every rule has a unique id and an executable check", () => {
    const ids = BPMN_STRUCTURAL_RULES.map((r) => r.id);
    expect(new Set(ids).size, "duplicate rule id in registry").toBe(ids.length);
    for (const r of BPMN_STRUCTURAL_RULES) {
      expect(typeof r.check, `${r.id} has no executable check`).toBe("function");
      expect(r.title.trim().length, `${r.id} needs a title`).toBeGreaterThan(0);
    }
  });

  for (const r of BPMN_STRUCTURAL_RULES) {
    it(`${r.id} — ${r.title}`, () => r.check());
  }
});
