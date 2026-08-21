import { describe, it, expect } from "vitest";
import { clearSimData } from "@/app/lib/simulation/clearSimData";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2850 — clearSimData backs the SuperAdmin "Clear simulation data" action, so
 * a diagram can be re-tested (Fill missing / seeding) from a clean slate. It
 * must remove EVERY sim annotation while leaving the drawing itself intact.
 */
const diagram: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "s1", type: "start-event", x: 0, y: 0, width: 40, height: 40, label: "Start",
      properties: { sim: { arrival: { kind: "exponential", mean: 10 } } } },
    { id: "t1", type: "task", x: 100, y: 0, width: 90, height: 50, label: "Do it",
      // A non-sim property must survive alongside the sim wipe.
      properties: { fillColor: "#ff0000", sim: { cycleTime: { kind: "fixed", value: 25 }, teamId: "Sales" } } },
    { id: "g1", type: "gateway", x: 250, y: 0, width: 40, height: 40, label: "?", properties: {} },
  ],
  connectors: [
    { id: "c1", sourceId: "s1", targetId: "t1", type: "sequence" } as never,
    { id: "c2", sourceId: "g1", targetId: "t1", type: "sequence", branchProbability: 70, isDefaultFlow: true, label: "yes" } as never,
  ],
} as unknown as DiagramData;

describe("clearSimData", () => {
  it("removes every sim annotation and branch routing value", () => {
    const { data, cleared } = clearSimData(diagram);
    expect(cleared).toBe(3); // 2 elements with sim + 1 connector with branch fields
    for (const el of data.elements) {
      expect(el.properties, `${el.id} still has sim`).not.toHaveProperty("sim");
      expect(getSimParams(el).cycleTime).toBeUndefined();
    }
    const c2 = data.connectors.find((c) => c.id === "c2")!;
    expect(c2.branchProbability).toBeUndefined();
    expect(c2.branchCondition).toBeUndefined();
    expect(c2.isDefaultFlow).toBeUndefined();
  });

  it("leaves the drawing itself untouched — shapes, flows, labels, other properties", () => {
    const { data } = clearSimData(diagram);
    expect(data.elements.map((e) => e.id)).toEqual(["s1", "t1", "g1"]);
    expect(data.connectors.map((c) => c.id)).toEqual(["c1", "c2"]);
    const t1 = data.elements.find((e) => e.id === "t1")!;
    expect(t1.label).toBe("Do it");
    expect(t1.x).toBe(100);
    expect(t1.properties.fillColor, "non-sim properties must survive").toBe("#ff0000");
    expect(data.connectors.find((c) => c.id === "c2")!.label).toBe("yes");
  });

  it("is a no-op (0 cleared) on a diagram with no simulation data", () => {
    const { data: once } = clearSimData(diagram);
    const { cleared } = clearSimData(once);
    expect(cleared).toBe(0);
  });
});
