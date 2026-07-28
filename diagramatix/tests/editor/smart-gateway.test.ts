/**
 * Smart Gateways — a freshly-dropped gateway alternates its default role with
 * the NEAREST gateway to its left: a Decision to the left → this defaults to a
 * Merge (no label, gatewayRole "merge"); a Merge to the left → this defaults to
 * a Decision ("Decision?", gatewayRole "decision"). No gateway to the left →
 * Decision. Role is read from an explicit properties.gatewayRole, else derived
 * from the neighbour's connections (out≥2 = decision, in≥2 = merge).
 */
import { describe, it, expect } from "vitest";
import { reducer, type Action } from "@/app/hooks/useDiagram";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const gw = (id: string, x: number, y = 100): DiagramElement => ({
  id, type: "gateway", x, y, width: 50, height: 50, label: "Decision?", properties: {},
} as DiagramElement);
const task = (id: string, x: number, y: number): DiagramElement => ({
  id, type: "task", x, y, width: 80, height: 50, label: id, properties: {},
} as DiagramElement);

const state = (elements: DiagramElement[], connectors: DiagramData["connectors"] = []): DiagramData =>
  ({ elements, connectors } as unknown as DiagramData);

const dropGateway = (s: DiagramData, x: number, y: number): DiagramElement => {
  const action: Action = {
    type: "ADD_ELEMENT",
    payload: { symbolType: "gateway", position: { x, y }, id: "gNew" },
  } as Action;
  const next = reducer(s, action);
  return next.elements.find((e) => e.id === "gNew")!;
};

const roleOf = (g: DiagramElement) => (g.properties as { gatewayRole?: string }).gatewayRole;

describe("Smart Gateways — alternate default from the nearest gateway to the left", () => {
  it("T1048 — a Decision gateway to the left → new gateway defaults to a Merge", () => {
    // g1 has TWO outgoing → derived role = decision.
    const s = state(
      [gw("g1", 100), task("t1", 300, 40), task("t2", 300, 160)],
      [
        { id: "c1", sourceId: "g1", targetId: "t1" },
        { id: "c2", sourceId: "g1", targetId: "t2" },
      ] as DiagramData["connectors"],
    );
    const g = dropGateway(s, 500, 100);
    expect(roleOf(g)).toBe("merge");
    expect(g.label).toBe("");
  });

  it("T1049 — a Merge gateway to the left → new gateway defaults to a Decision", () => {
    // g1 has TWO incoming → derived role = merge.
    const s = state(
      [gw("g1", 100), task("t1", -100, 40), task("t2", -100, 160)],
      [
        { id: "c1", sourceId: "t1", targetId: "g1" },
        { id: "c2", sourceId: "t2", targetId: "g1" },
      ] as DiagramData["connectors"],
    );
    const g = dropGateway(s, 500, 100);
    expect(roleOf(g)).toBe("decision");
    expect(g.label).toBe("Decision?");
  });

  it("T1050 — no gateway to the left → defaults to a Decision", () => {
    const s = state([task("t1", 50, 100)]);
    const g = dropGateway(s, 500, 100);
    expect(roleOf(g)).toBe("decision");
    expect(g.label).toBe("Decision?");
  });

  it("T1051 — an explicit gatewayRole on the left neighbour wins over derivation", () => {
    const left = { ...gw("g1", 100), properties: { gatewayRole: "merge" } } as DiagramElement;
    const s = state([left]);
    const g = dropGateway(s, 500, 100);
    // left is a Merge → new defaults to Decision.
    expect(roleOf(g)).toBe("decision");
  });
});
