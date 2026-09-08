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
import type { BusinessCaseInputs } from "./facts/businessCase";
import type { OverrideSet } from "./overrides";
import { calendarRefsToNames } from "./calendarRefs";

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
    select: { name: true, capacity: true, costPerHour: true, efficiency: true, calendarId: true, members: true, skillsSource: true },
  });
  const calendarRows = await prisma.simulationCalendar.findMany({
    where: { projectId },
    select: { id: true, name: true, pattern: true },
  });
  const calendarIdToName = new Map(calendarRows.map((c) => [c.id, c.name]));
  const calendars = calendarRows.map((c) => ({
    name: c.name,
    pattern: (c.pattern ?? { intervals: [] }) as unknown as WorkCalendar,
    id: c.id,
  }));
  const teams = teamRows.map((t) => {
    // Named people, when the team declares any. Omitted entirely when it does
    // not, so a counted-pool team captures byte-for-byte as it always did.
    const members = (Array.isArray(t.members) ? (t.members as unknown as { name?: string; skills?: unknown }[]) : [])
      .filter((m) => typeof m?.name === "string" && m.name.trim())
      .map((m) => ({
        name: m.name!.trim(),
        skills: Array.isArray(m.skills) ? (m.skills as unknown[]).filter((x): x is string => typeof x === "string") : [],
      }));
    const source = (t.skillsSource ?? {}) as Record<string, unknown>;
    return {
      name: t.name, capacity: t.capacity, costPerHour: t.costPerHour, efficiency: t.efficiency,
      ...(t.calendarId && calendarIdToName.has(t.calendarId) ? { calendarName: calendarIdToName.get(t.calendarId) } : {}),
      ...(members.length ? { members } : {}),
      ...(Object.keys(source).length ? { skillsSource: source } : {}),
    };
  });
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
  // Companions: the diagrams a team's skills were FILLED FROM. This is a real
  // stored reference (skillsSource.diagramId), not a guess about what looks
  // related, so the package carries exactly the ArchiMate model the matrix came
  // from and nothing else.
  const companionIds = Array.from(new Set(
    (await prisma.simulationTeam.findMany({ where: { projectId }, select: { skillsSource: true } }))
      .map((t) => (t.skillsSource as { diagramId?: unknown } | null)?.diagramId)
      .filter((x): x is string => typeof x === "string" && !!x),
  )).filter((id) => !rootIds.includes(id) && !variantIds.includes(id));
  const captureIds = Array.from(new Set([...rootIds, ...variantIds, ...companionIds]));
  const diagramRows = await prisma.diagram.findMany({ where: { id: { in: captureIds } }, select: { id: true, name: true, type: true, data: true } });
  const capturedKeys = new Set(diagramRows.map((d) => d.id));

  const { teams, calendars } = await captureProjectLibrary(projectId);
  // Business-case inputs live on the STUDY. Without them an adopted comparison
  // example cannot produce a payback month, which is the one figure it exists
  // to show.
  const businessCase = (study.businessCase ?? {}) as unknown as BusinessCaseInputs;

  // A source's operating-hours calendar is stored as a bare project-scoped id,
  // which means nothing once this package lands somewhere else. Rewrite those
  // references to the calendar NAME — the same identity teams already use — so
  // the package is self-describing and adopt can re-point them.
  const idToName = new Map((calendars ?? []).filter((c) => c.id).map((c) => [c.id as string, c.name]));
  const diagrams: ExampleDiagram[] = diagramRows.map((d) => ({
    key: d.id, name: d.name, type: d.type || "bpmn",
    data: calendarRefsToNames((d.data ?? { elements: [], connectors: [] }) as unknown as DiagramData, idToName),
  }));

  // A referenced companion whose diagram has since been deleted simply is not
  // carried; the matrix it produced is still valid and still travels.
  const presentCompanions = companionIds.filter((id) => capturedKeys.has(id));

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
    ...(presentCompanions.length ? { companionKeys: presentCompanions } : {}),
    study: {
      name: study.name,
      rootKeys: rootIds,
      // Only when the study actually has inputs — an empty object would claim a
      // business case had been configured when none had.
      ...(Object.keys(businessCase).length ? { businessCase } : {}),
    },
    scenarios,
  };
  const errs = validateExamplePackage(pkg);
  if (errs.length) throw new Error(`Captured package invalid: ${errs.join("; ")}`);
  return { pkg, studyName: study.name };
}
