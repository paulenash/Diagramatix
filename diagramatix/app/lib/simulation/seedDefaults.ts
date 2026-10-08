/**
 * Apply the default simulation setup to a project via the existing POST routes.
 *
 * Reads what already exists, asks planDefaultSetup for the MISSING pieces, then
 * creates them: the three working calendars, one team per harvested lane (default
 * capacity 1, assigned the "Business Hours" calendar), and — if the project has no
 * studies — an "Initial Study" with a "Baseline" scenario. Idempotent: running it
 * again creates nothing, because planDefaultSetup only returns what's absent.
 *
 * The fetch implementation is injectable so the orchestration is unit-testable
 * without a live server.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { planDefaultSetup, BUSINESS_HOURS_NAME, DEFAULT_STUDY_HORIZON_MINUTES } from "./defaultSetup";
import { DEFAULT_RUN_CONFIG } from "./types";

export interface SeedResult {
  calendarsCreated: number;
  teamsCreated: number;
  studyCreated: boolean;
  /** Diagrams added to the study's Root Diagrams. */
  rootsAdded: number;
}

export interface SeedOptions {
  /**
   * The diagram the Simulator was entered from and everything it links to, down the link tree, current diagram first (Paul, 2026-10-08:
   * "make sure the simulator checks the current diagram and any linked diagrams … down the link tree as root diagrams automatically").
   * They are ticked as the study's Root Diagrams when the project has exactly ONE study (with several there is no telling which one is
   * meant), by adding only — a root already ticked, or ticked for another process, is never removed. Absent in project mode.
   */
  rootIds?: string[];
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function seedSimulationDefaults(
  projectId: string,
  diagrams: DiagramData[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  opts: SeedOptions = {},
): Promise<SeedResult> {
  const base = `/api/projects/${projectId}`;
  const getJson = async (url: string): Promise<Record<string, unknown> | null> => {
    try {
      const r = await fetchImpl(url);
      return r.ok ? ((await r.json()) as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  };
  const post = (url: string, body: unknown) =>
    fetchImpl(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });

  const [calR, teamR, studyR] = await Promise.all([
    getJson(`${base}/simulation-calendars`),
    getJson(`${base}/simulation-teams`),
    getJson(`${base}/simulation/studies`),
  ]);
  const rows = (o: Record<string, unknown> | null, key: string): { name: string; id?: string }[] =>
    Array.isArray(o?.[key]) ? (o![key] as { name: string; id?: string }[]) : [];

  const plan = planDefaultSetup(diagrams, {
    calendars: rows(calR, "calendars").map((c) => ({ name: c.name })),
    teams: rows(teamR, "teams").map((t) => ({ name: t.name })),
    studyCount: rows(studyR, "studies").length,
  });

  // 1 · calendars (each carries its shift pattern)
  for (const c of plan.calendarsToCreate) {
    await post(`${base}/simulation-calendars`, { name: c.name, pattern: c.calendar });
  }

  // 2 · resources — each carries its own capacity and calendar (people on
  //     Business Hours; Automation around the clock), so re-read the calendars
  //     first: the one a resource needs may have just been created above.
  if (plan.teamsToCreate.length) {
    const fresh = await getJson(`${base}/simulation-calendars`);
    const calByName = new Map(
      rows(fresh, "calendars").map((c) => [(c.name ?? "").trim().toLowerCase(), c.id]),
    );
    for (const t of plan.teamsToCreate) {
      await post(`${base}/simulation-teams`, {
        name: t.name,
        capacity: t.capacity,
        calendarId: calByName.get(t.calendarName.trim().toLowerCase()),
      });
    }
  }

  // 3 · study + baseline scenario
  let studyCreated = false;
  if (plan.createStudy) {
    const created = await post(`${base}/simulation/studies`, { name: plan.studyName });
    const studyId = created.ok
      ? ((await created.json()) as { study?: { id?: string } }).study?.id
      : undefined;
    if (studyId) {
      const sc = await post(`${base}/simulation/studies/${studyId}/scenarios`, {
        name: plan.scenarioName,
        isBaseline: true,
      });
      studyCreated = true;
      // The seeded Baseline runs for 8 days, not the stock 480 minutes (Paul, 2026-10-08).
      const scenarioId = sc.ok ? ((await sc.json()) as { scenario?: { id?: string } }).scenario?.id : undefined;
      if (scenarioId) {
        await fetchImpl(`${base}/simulation/studies/${studyId}/scenarios/${scenarioId}`, {
          method: "PUT", headers: JSON_HEADERS,
          body: JSON.stringify({ runConfig: { ...DEFAULT_RUN_CONFIG, horizon: DEFAULT_STUDY_HORIZON_MINUTES } }),
        });
      }
    }
  }

  // 4 · Root Diagrams: the diagram the Simulator was entered from and its whole link tree. Only when there is exactly one study; adds, never removes.
  let rootsAdded = 0;
  if (opts.rootIds && opts.rootIds.length > 0) {
    const list = await getJson(`${base}/simulation/studies`);
    const studies = rows(list, "studies");
    if (studies.length === 1 && studies[0].id) {
      const bpmn = new Set(rows(list, "diagrams").map((d) => d.id));       // only BPMN diagrams can be simulated
      const detail = await getJson(`${base}/simulation/studies/${studies[0].id}`);
      const have = new Set(((detail?.study as { roots?: { diagram: { id: string } }[] } | undefined)?.roots ?? []).map((r) => r.diagram.id));
      const missing = opts.rootIds.filter((id) => bpmn.has(id) && !have.has(id));
      if (missing.length > 0) {
        const r = await fetchImpl(`${base}/simulation/studies/${studies[0].id}`, {
          method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ rootDiagramIds: [...have, ...missing] }),
        });
        if (r.ok) rootsAdded = missing.length;
      }
    }
  }

  return {
    calendarsCreated: plan.calendarsToCreate.length,
    teamsCreated: plan.teamsToCreate.length,
    studyCreated,
    rootsAdded,
  };
}
