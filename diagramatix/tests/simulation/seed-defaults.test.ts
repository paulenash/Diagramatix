import { describe, it, expect } from "vitest";
import { seedSimulationDefaults } from "@/app/lib/simulation/seedDefaults";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2846 — seedSimulationDefaults orchestration.
 *
 * On first open of an EMPTY project it must create the three working calendars,
 * one team per harvested lane (assigned the Business Hours calendar), and an
 * Initial Study + Baseline scenario. On a project that already has all of them it
 * must create nothing (idempotent).
 */
const json = (body: unknown, status = 200) => ({ ok: status < 400, json: async () => body });

function mockServer(initial: { calendars?: { id: string; name: string }[]; teams?: { name: string }[]; studies?: unknown[] }) {
  const calendars = [...(initial.calendars ?? [])];
  const teams = [...(initial.teams ?? [])];
  const studies = [...(initial.studies ?? [])];
  const calls: { url: string; method: string; body?: any }[] = [];
  let seq = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/simulation-calendars")) {
      if (method === "GET") return json({ calendars });
      const c = { id: `cal${++seq}`, name: body.name }; calendars.push(c); return json({ calendar: c }, 201);
    }
    if (url.endsWith("/simulation-teams")) {
      if (method === "GET") return json({ teams });
      const t = { id: `team${++seq}`, name: body.name }; teams.push(t); return json({ team: t }, 201);
    }
    if (url.endsWith("/simulation/studies")) {
      if (method === "GET") return json({ studies, diagrams: [] });
      const s = { id: `study${++seq}`, name: body.name }; studies.push(s); return json({ study: s }, 201);
    }
    if (url.includes("/scenarios")) return json({ scenario: { id: `scen${++seq}`, ...body } }, 201);
    return json({}, 404);
  };
  return { fetchImpl, calls };
}

// A pool with two lanes, each holding a task → harvestLaneTeams = [Sales, Ops].
const twoLaneProject: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "P", type: "pool", x: 0, y: 0, width: 600, height: 200, label: "Order", properties: {} },
    { id: "sales", type: "lane", parentId: "P", x: 40, y: 0, width: 560, height: 100, label: "Sales", properties: {} },
    { id: "ops", type: "lane", parentId: "P", x: 40, y: 100, width: 560, height: 100, label: "Ops", properties: {} },
    { id: "t1", type: "task", parentId: "sales", x: 100, y: 25, width: 90, height: 50, label: "Take order", properties: {} },
    { id: "t2", type: "task", parentId: "ops", x: 100, y: 125, width: 90, height: 50, label: "Fulfil", properties: {} },
  ],
  connectors: [],
} as unknown as DiagramData;

describe("seedSimulationDefaults", () => {
  it("seeds calendars, lane teams (on Business Hours) + study/baseline for an empty project", async () => {
    const { fetchImpl, calls } = mockServer({});
    const res = await seedSimulationDefaults("proj1", [twoLaneProject], fetchImpl as any);

    expect(res).toEqual({ calendarsCreated: 3, teamsCreated: 2, studyCreated: true });

    const posts = calls.filter((c) => c.method === "POST");
    const calNames = posts.filter((c) => c.url.endsWith("/simulation-calendars")).map((c) => c.body.name);
    expect(calNames).toEqual(["24/7", "Business Hours", "Business Hours + lunch"]);

    const teamPosts = posts.filter((c) => c.url.endsWith("/simulation-teams"));
    expect(teamPosts.map((c) => c.body.name)).toEqual(["Sales", "Ops"]);
    // Every seeded team is capacity 1 and assigned the freshly-created Business Hours calendar (cal2).
    for (const tp of teamPosts) { expect(tp.body.capacity).toBe(1); expect(tp.body.calendarId).toBe("cal2"); }

    const studyPost = posts.find((c) => c.url.endsWith("/simulation/studies"));
    expect(studyPost?.body.name).toBe("Initial Study");
    const scenarioPost = posts.find((c) => c.url.includes("/scenarios"));
    expect(scenarioPost?.body).toMatchObject({ name: "Baseline", isBaseline: true });
  });

  it("creates nothing when the project already has the defaults (idempotent)", async () => {
    const { fetchImpl, calls } = mockServer({
      calendars: [
        { id: "c1", name: "24/7" }, { id: "c2", name: "Business Hours" }, { id: "c3", name: "Business Hours + lunch" },
      ],
      teams: [{ name: "Sales" }, { name: "Ops" }],
      studies: [{ id: "s1" }],
    });
    const res = await seedSimulationDefaults("proj1", [twoLaneProject], fetchImpl as any);
    expect(res).toEqual({ calendarsCreated: 0, teamsCreated: 0, studyCreated: false });
    expect(calls.some((c) => c.method === "POST"), "no POST should have been made").toBe(false);
  });
});
