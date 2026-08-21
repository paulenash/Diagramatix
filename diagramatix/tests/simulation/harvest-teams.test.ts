/**
 * Team harvesting: the team library derives from the lowest active lane/sublane
 * (or pool) of every task, deduped by name across the diagram hierarchy.
 */
import { describe, it, expect } from "vitest";
import { harvestLaneTeams } from "@/app/lib/simulation/harvestTeams";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: {}, ...extra }) as DiagramElement;

describe("harvest lane teams (T2838)", () => {
  it("uses the lowest lane/sublane a task sits in, falling back to the pool", () => {
    const d: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        el("P", "pool", { label: "Company" }),
        el("L1", "lane", { label: "Sales", parentId: "P" }),
        el("SL", "sublane", { label: "Inside Sales", parentId: "L1" }),
        el("t1", "task", { label: "Qualify", parentId: "SL" }),   // → Inside Sales (sublane wins)
        el("t2", "task", { label: "Close", parentId: "L1" }),     // → Sales (lane)
        el("P2", "pool", { label: "Ops" }),
        el("t3", "task", { label: "Fulfil", parentId: "P2" }),    // → Ops (no lane → pool)
      ],
      connectors: [],
    };
    expect(harvestLaneTeams([d])).toEqual(["Inside Sales", "Sales", "Ops"]);
  });

  it("dedupes team names across multiple (linked) diagrams", () => {
    const mk = (taskId: string, laneLabel: string): DiagramData => ({
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [el("P", "pool", { label: "P" }), el("L", "lane", { label: laneLabel, parentId: "P" }), el(taskId, "task", { parentId: "L" })],
      connectors: [],
    });
    expect(harvestLaneTeams([mk("a", "Finance"), mk("b", "Finance"), mk("c", "HR")])).toEqual(["Finance", "HR"]);
  });
});
