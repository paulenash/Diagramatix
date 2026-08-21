/** planDefaultSetup: idempotent — returns only the missing calendars/teams/study. */
import { describe, it, expect } from "vitest";
import { planDefaultSetup, DEFAULT_CALENDARS } from "@/app/lib/simulation/defaultSetup";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 80, height: 40, label: id, properties: {}, ...extra }) as DiagramElement;
const diag = (): DiagramData => ({
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [el("P", "pool", { label: "Co" }), el("L", "lane", { label: "Sales", parentId: "P" }), el("t", "task", { parentId: "L" })],
  connectors: [],
});

describe("planDefaultSetup (T2839)", () => {
  it("on an empty project plans all 3 calendars, the lane teams, and a study", () => {
    const p = planDefaultSetup([diag()], { calendars: [], teams: [], studyCount: 0 });
    expect(p.calendarsToCreate).toHaveLength(3);
    expect(p.teamsToCreate).toEqual(["Sales"]);
    expect(p.createStudy).toBe(true);
    expect(p.studyName).toBe("Initial Study");
    expect(p.scenarioName).toBe("Baseline");
  });

  it("is idempotent — nothing to create when everything already exists (case-insensitive)", () => {
    const p = planDefaultSetup([diag()], {
      calendars: DEFAULT_CALENDARS.map((c) => ({ name: c.name.toUpperCase() })),
      teams: [{ name: "sales" }],
      studyCount: 1,
    });
    expect(p.calendarsToCreate).toHaveLength(0);
    expect(p.teamsToCreate).toHaveLength(0);
    expect(p.createStudy).toBe(false);
  });
});
