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
    // People: one person, working hours.
    expect(p.teamsToCreate).toEqual([{ name: "Sales", capacity: 1, calendarName: "Business Hours" }]);
    expect(p.createStudy).toBe(true);
    expect(p.studyName).toBe("Initial Study");
    expect(p.scenarioName).toBe("Baseline");
  });

  /**
   * T2860 — a model containing system work gets the shared Automation resource:
   * 24/7 and effectively unconstrained. It saves drawing an "Automation" lane and
   * zig-zagging the flow into and out of it — the step stays in the lane that
   * OWNS it while being charged to the resource that actually performs it.
   * Created only when such work exists, and never when the user already has it.
   */
  it("adds the Automation resource when the model contains system work", () => {
    const withService: DiagramData = {
      ...diag(),
      elements: [...diag().elements, el("svc", "task", { parentId: "L", taskType: "service" } as Partial<DiagramElement>)],
    };
    const p = planDefaultSetup([withService], { calendars: [], teams: [], studyCount: 0 });
    expect(p.teamsToCreate).toEqual(expect.arrayContaining([
      { name: "Sales", capacity: 1, calendarName: "Business Hours" },
      // Unconstrained, so system steps never become an accidental bottleneck.
      { name: "Automation", capacity: 999, calendarName: "24/7" },
    ]));
  });

  it("does NOT add it to a process with no system work", () => {
    const p = planDefaultSetup([diag()], { calendars: [], teams: [], studyCount: 0 });
    expect(p.teamsToCreate.map((t) => t.name)).not.toContain("Automation");
  });

  it("does not duplicate an Automation resource the project already has", () => {
    const withService: DiagramData = {
      ...diag(),
      elements: [...diag().elements, el("svc", "task", { parentId: "L", taskType: "service" } as Partial<DiagramElement>)],
    };
    const p = planDefaultSetup([withService], { calendars: [], teams: [{ name: "automation" }], studyCount: 0 });
    expect(p.teamsToCreate.map((t) => t.name)).not.toContain("Automation");
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
