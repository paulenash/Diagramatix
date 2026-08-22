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
import { planDefaultSetup, BUSINESS_HOURS_NAME } from "./defaultSetup";

export interface SeedResult {
  calendarsCreated: number;
  teamsCreated: number;
  studyCreated: boolean;
}

type FetchLike = (url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function seedSimulationDefaults(
  projectId: string,
  diagrams: DiagramData[],
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
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
      await post(`${base}/simulation/studies/${studyId}/scenarios`, {
        name: plan.scenarioName,
        isBaseline: true,
      });
      studyCreated = true;
    }
  }

  return {
    calendarsCreated: plan.calendarsToCreate.length,
    teamsCreated: plan.teamsToCreate.length,
    studyCreated,
  };
}
