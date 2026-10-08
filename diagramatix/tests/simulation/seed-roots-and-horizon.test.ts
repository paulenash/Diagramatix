/**
 * T5286 — entering the Simulator from a diagram (Paul, 2026-10-08):
 *   1. "make sure the simulator checks the current diagram and any linked diagrams to the current diagram and so on down the link tree as
 *      root diagrams automatically";
 *   2. "automatically set the horizon for 8 days".
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { seedSimulationDefaults } from "@/app/lib/simulation/seedDefaults";
import { DEFAULT_STUDY_HORIZON_MINUTES } from "@/app/lib/simulation/defaultSetup";
import type { DiagramData } from "@/app/lib/diagram/types";

const json = (body: unknown, status = 200) => ({ ok: status < 400, json: async () => body });
const EMPTY = { viewport: { x: 0, y: 0, zoom: 1 }, elements: [], connectors: [] } as unknown as DiagramData;

/** A project server with BPMN diagrams A, B, C (a non-BPMN diagram Z is not in the study-roots list), and a given set of studies. */
function server(studies: { id: string; roots: string[] }[]) {
  const rows = studies.map((s) => ({ ...s }));
  const calls: { url: string; method: string; body?: any }[] = [];
  let seq = 0;
  const fetchImpl = async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method, body });
    if (url.endsWith("/simulation-calendars")) return json(method === "GET" ? { calendars: [{ id: "c1", name: "24/7" }, { id: "c2", name: "Business Hours" }, { id: "c3", name: "Business Hours + lunch" }] } : {}, method === "GET" ? 200 : 201);
    if (url.endsWith("/simulation-teams")) return json({ teams: [] });
    if (url.endsWith("/simulation/studies")) {
      if (method === "GET") return json({ studies: rows.map((s) => ({ id: s.id, name: s.id })), diagrams: [{ id: "A", name: "A" }, { id: "B", name: "B" }, { id: "C", name: "C" }] });
      const s = { id: `study${++seq}`, roots: [] as string[] }; rows.push(s); return json({ study: s }, 201);
    }
    const one = url.match(/\/simulation\/studies\/([^/]+)$/);
    if (one) {
      const s = rows.find((r) => r.id === one[1]);
      if (method === "PUT") { if (s) s.roots = body.rootDiagramIds; return json({ study: s }); }
      return json({ study: s ? { id: s.id, roots: s.roots.map((id) => ({ diagram: { id } })), scenarios: [] } : null });
    }
    if (url.endsWith("/scenarios")) return json({ scenario: { id: "scen1", ...body } }, 201);
    if (/\/scenarios\/[^/]+$/.test(url)) return json({});
    return json({}, 404);
  };
  return { fetchImpl, calls, rows };
}
const putStudy = (calls: { url: string; method: string; body?: any }[]) => calls.find((c) => c.method === "PUT" && /\/simulation\/studies\/[^/]+$/.test(c.url));

describe("T5286 entering the Simulator from a diagram", () => {
  it("a new study gets the current diagram and its whole link tree as Root Diagrams, and an 8-day Baseline", async () => {
    const { fetchImpl, calls, rows } = server([]);
    const res = await seedSimulationDefaults("p", [EMPTY], fetchImpl as never, { rootIds: ["A", "B", "C"] });
    expect(res.studyCreated).toBe(true);
    expect(res.rootsAdded).toBe(3);
    expect(rows[0].roots).toEqual(["A", "B", "C"]);
    const scen = calls.find((c) => c.method === "PUT" && /\/scenarios\/scen1$/.test(c.url))!;
    expect(scen.body.runConfig).toMatchObject({ clockUnit: "minute", horizon: DEFAULT_STUDY_HORIZON_MINUTES });
    expect(DEFAULT_STUDY_HORIZON_MINUTES).toBe(8 * 24 * 60);
  });
  it("an existing single study gains the missing roots; nothing already there is removed", async () => {
    const { fetchImpl, calls } = server([{ id: "s1", roots: ["C"] }]);
    const res = await seedSimulationDefaults("p", [EMPTY], fetchImpl as never, { rootIds: ["A", "B", "Z"] });   // Z is not a BPMN diagram
    expect(res.rootsAdded).toBe(2);
    expect(putStudy(calls)!.body.rootDiagramIds).toEqual(["C", "A", "B"]);
  });
  it("roots already ticked: no write at all", async () => {
    const { fetchImpl, calls } = server([{ id: "s1", roots: ["A", "B"] }]);
    const res = await seedSimulationDefaults("p", [EMPTY], fetchImpl as never, { rootIds: ["A", "B"] });
    expect(res.rootsAdded).toBe(0);
    expect(putStudy(calls)).toBeUndefined();
  });
  it("with several studies there is no telling which is meant, so none is touched", async () => {
    const { fetchImpl, calls } = server([{ id: "s1", roots: [] }, { id: "s2", roots: [] }]);
    const res = await seedSimulationDefaults("p", [EMPTY], fetchImpl as never, { rootIds: ["A"] });
    expect(res.rootsAdded).toBe(0);
    expect(putStudy(calls)).toBeUndefined();
  });
  it("project mode (no rootIds) ticks nothing", async () => {
    const { fetchImpl, calls } = server([{ id: "s1", roots: [] }]);
    const res = await seedSimulationDefaults("p", [EMPTY], fetchImpl as never);
    expect(res.rootsAdded).toBe(0);
    expect(putStudy(calls)).toBeUndefined();
  });
  it("the console passes the diagram's link tree, current diagram first, and re-seeds when the tree changes", () => {
    const src = readFileSync("app/components/simulation/SimulatorConsole.tsx", "utf8");
    expect(src).toContain("const rootIds = diagramId ? reachableDiagramIds(diagramId, diagramsById) : undefined;");
    expect(src).toContain("seedSimulationDefaults(projectId, diagrams, undefined, { rootIds })");
    expect(src).toContain("res.rootsAdded");
  });
});
