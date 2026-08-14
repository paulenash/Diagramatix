/**
 * Capture a project's simulation into a portable ExamplePackage — diagrams (the
 * study's roots + any As-is/To-be variant diagrams), the team library, the
 * calendar library, and the study + its scenarios. The neutral bundle behind
 * both the SuperAdmin "Simulator Examples" capture AND the user-facing
 * "Export simulation" download (adoptPackage is the inverse).
 */
import { prisma } from "@/app/lib/db";
import type { DiagramData } from "@/app/lib/diagram/types";
import {
  validateExamplePackage,
  type ExamplePackage,
  type ExampleDiagram,
  type ExampleLibrary,
  type ExampleScenario,
} from "./examplePackage";
import type { ScenarioRunConfig, WorkCalendar } from "./types";
import type { OverrideSet } from "./overrides";

const variantIdsOf = (id: unknown): string[] =>
  Array.isArray(id) ? (id as unknown[]).filter((x): x is string => typeof x === "string") : [];

export interface CaptureResult { pkg: ExamplePackage; studyName: string }

/** Capture a project's simulation LIBRARY (teams + their working calendars),
 *  independent of any study. A package embeds this, but so does a backup/export
 *  on its own — a project can own a fully-configured library before its first
 *  study exists, and that library must survive a backup/restore round-trip. */
export async function captureProjectLibrary(projectId: string): Promise<ExampleLibrary> {
  const teamRows = await prisma.simulationTeam.findMany({
    where: { projectId },
    select: { name: true, capacity: true, costPerHour: true, efficiency: true, calendarId: true },
  });
  const calendarRows = await prisma.simulationCalendar.findMany({
    where: { projectId },
    select: { id: true, name: true, pattern: true },
  });
  const calendarIdToName = new Map(calendarRows.map((c) => [c.id, c.name]));
  const calendars = calendarRows.map((c) => ({
    name: c.name,
    pattern: (c.pattern ?? { intervals: [] }) as unknown as WorkCalendar,
  }));
  const teams = teamRows.map((t) => ({
    name: t.name, capacity: t.capacity, costPerHour: t.costPerHour, efficiency: t.efficiency,
    ...(t.calendarId && calendarIdToName.has(t.calendarId) ? { calendarName: calendarIdToName.get(t.calendarId) } : {}),
  }));
  return { teams, ...(calendars.length ? { calendars } : {}) };
}

/** True when a project has nothing worth carrying in its library. */
export const isEmptyLibrary = (lib: ExampleLibrary): boolean =>
  lib.teams.length === 0 && (lib.calendars?.length ?? 0) === 0;

/** Capture EVERY simulation study in a project as portable packages (config only:
 *  study + scenarios + team/calendar libraries; no run results). Used to embed a
 *  project's simulation configuration in JSON exports + scoped backups so it
 *  survives export/import. Invalid/empty studies are skipped, never fatal. */
export async function captureAllProjectPackages(projectId: string): Promise<ExamplePackage[]> {
  const studies = await prisma.simulationStudy.findMany({ where: { projectId }, select: { id: true } });
  const out: ExamplePackage[] = [];
  for (const s of studies) {
    try { out.push((await captureProjectPackage(projectId, s.id)).pkg); }
    catch { /* skip a study that can't be captured (e.g. no roots) */ }
  }
  return out;
}

/** Build the portable package for one study in a project. Throws on a missing
 *  study or a package that fails structural validation. */
export async function captureProjectPackage(projectId: string, studyId: string): Promise<CaptureResult> {
  const study = await prisma.simulationStudy.findFirst({
    where: { id: studyId, projectId },
    include: { roots: true, scenarios: { orderBy: { createdAt: "asc" } } },
  });
  if (!study) throw new Error("Study not found in project");

  // Root diagrams + any scenario-pinned variant diagrams (id = package key).
  const rootIds = study.roots.map((r) => r.diagramId);
  const variantIds = study.scenarios.flatMap((s) => variantIdsOf(s.variantRootIds));
  const captureIds = Array.from(new Set([...rootIds, ...variantIds]));
  const diagramRows = await prisma.diagram.findMany({ where: { id: { in: captureIds } }, select: { id: true, name: true, type: true, data: true } });
  const capturedKeys = new Set(diagramRows.map((d) => d.id));
  const diagrams: ExampleDiagram[] = diagramRows.map((d) => ({
    key: d.id, name: d.name, type: d.type || "bpmn", data: (d.data ?? {}) as unknown as DiagramData,
  }));

  const { teams, calendars } = await captureProjectLibrary(projectId);

  const scenarios: ExampleScenario[] = study.scenarios.map((s) => {
    const variantRootKeys = variantIdsOf(s.variantRootIds).filter((k) => capturedKeys.has(k));
    return {
      name: s.name,
      isBaseline: s.isBaseline,
      runConfig: (s.runConfig ?? {}) as unknown as ScenarioRunConfig,
      overrides: (s.overrides ?? {}) as unknown as OverrideSet,
      ...(variantRootKeys.length ? { variantRootKeys } : {}),
    };
  });

  const pkg: ExamplePackage = {
    version: 1,
    teams,
    ...(calendars?.length ? { calendars } : {}),
    diagrams,
    study: { name: study.name, rootKeys: rootIds },
    scenarios,
  };
  const errs = validateExamplePackage(pkg);
  if (errs.length) throw new Error(`Captured package invalid: ${errs.join("; ")}`);
  return { pkg, studyName: study.name };
}
