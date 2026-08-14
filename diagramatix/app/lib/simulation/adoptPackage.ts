/**
 * Adopt a portable ExamplePackage INTO a fresh project owned by the caller —
 * recreates the diagrams (element/connector ids preserved so sim params +
 * interventions stay valid; linkedDiagramId + study roots + variant roots
 * remapped to the freshly-minted diagram ids), the team library, the calendar
 * library, and the study + scenarios. The inverse of captureProjectPackage;
 * shared by the example "adopt" route AND the user-facing "Import simulation".
 */
import { prisma } from "@/app/lib/db";
import { validateExamplePackage, type ExampleLibrary, type ExamplePackage } from "./examplePackage";

export interface AdoptCtx {
  userId: string;
  orgId: string;
  ownerName: string;
  projectName: string;
  sourceExampleId?: string;
}

/** Prisma interactive-transaction client type (inferred, no Prisma namespace import). */
type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Recreate a simulation LIBRARY (calendars + teams) inside an EXISTING project,
 * REUSING any row that already carries the same name in that project rather than
 * inserting a second one.
 *
 * The library is project-wide but every package embeds a copy of it, so a project
 * with N studies yields N packages that each carry the whole library. Blind
 * inserts multiplied the team + calendar rows by N on restore. Name is the
 * package-level identity for both (teams reference calendars by name, and
 * overrides/interventions reference teams by name), so reuse-by-name is the
 * correct merge key. Adopting into a fresh project is unaffected — nothing
 * pre-exists, so every row is still created exactly once.
 *
 * Returns the calendar name → id map for the project.
 */
export async function adoptLibraryInto(
  tx: Tx,
  lib: ExampleLibrary,
  projectId: string,
): Promise<Map<string, string>> {
  // Working-calendar library (first, so teams can reference by id).
  const calendarNameToId = new Map<string, string>();
  for (const c of lib.calendars ?? []) {
    const existing = await tx.simulationCalendar.findFirst({
      where: { projectId, name: c.name }, select: { id: true },
    });
    if (existing) { calendarNameToId.set(c.name, existing.id); continue; }
    const cal = await tx.simulationCalendar.create({ data: { name: c.name, projectId } });
    calendarNameToId.set(c.name, cal.id);
    await tx.$executeRaw`UPDATE "SimulationCalendar" SET pattern = ${JSON.stringify(c.pattern ?? { intervals: [] })}::jsonb WHERE id = ${cal.id}`;
  }

  // Team library (link each team to its calendar by name → id).
  for (const t of lib.teams) {
    const existing = await tx.simulationTeam.findFirst({
      where: { projectId, name: t.name }, select: { id: true },
    });
    if (existing) continue;
    await tx.simulationTeam.create({
      data: {
        name: t.name, projectId,
        capacity: Math.max(1, Math.round(t.capacity ?? 1)),
        costPerHour: t.costPerHour ?? null,
        efficiency: t.efficiency && t.efficiency > 0 ? t.efficiency : 1,
        calendarId: t.calendarName ? calendarNameToId.get(t.calendarName) ?? null : null,
      },
    });
  }
  return calendarNameToId;
}

/**
 * Replay a `{ originalProjectId → library }` map into already-restored projects.
 * Runs BEFORE replaySimulationPackages so a project whose library exists without
 * any study still gets its teams/calendars back; packages replayed afterwards
 * then reuse those rows by name instead of duplicating them.
 */
export async function replaySimulationLibraries(
  tx: Tx,
  libraries: Record<string, ExampleLibrary> | undefined | null,
  projectIdMap: Map<string, string>,
): Promise<number> {
  if (!libraries) return 0;
  let n = 0;
  for (const [origProjectId, lib] of Object.entries(libraries)) {
    const newProjectId = projectIdMap.get(origProjectId);
    if (!newProjectId || !lib || !Array.isArray(lib.teams)) continue;
    await adoptLibraryInto(tx, lib, newProjectId);
    n += lib.teams.length;
  }
  return n;
}

/**
 * Recreate a package's simulation LIBRARY (calendars + teams) and its STUDY +
 * scenarios inside an EXISTING project. Diagrams must already exist; their
 * package keys are resolved to real diagram ids via `keyToDiagramId`. Shared by
 * adoptPackage (fresh project) and the JSON-export / backup replay paths, so all
 * three build the simulation graph the same, tested way. Run results are not
 * part of a package (config only), by design.
 */
export async function adoptPackageInto(
  tx: Tx,
  pkg: ExamplePackage,
  ctx: { projectId: string; keyToDiagramId: Map<string, string>; userId: string | null },
): Promise<void> {
  const { projectId, keyToDiagramId, userId } = ctx;

  await adoptLibraryInto(tx, pkg, projectId);

  // Study + roots (remap package keys → new diagram ids).
  const study = await tx.simulationStudy.create({ data: { name: pkg.study.name, projectId, createdById: userId } });
  for (const rk of pkg.study.rootKeys) {
    const diagramId = keyToDiagramId.get(rk);
    if (diagramId) await tx.simulationStudyRoot.create({ data: { studyId: study.id, diagramId } });
  }

  // Scenarios — config + overrides + variant roots (remapped).
  for (const sc of pkg.scenarios) {
    const variantRootIds = (sc.variantRootKeys ?? []).map((k) => keyToDiagramId.get(k)).filter((x): x is string => !!x);
    await tx.simulationScenario.create({
      data: {
        name: sc.name, studyId: study.id, isBaseline: !!sc.isBaseline,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        runConfig: (sc.runConfig ?? {}) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        overrides: (sc.overrides ?? {}) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(variantRootIds.length ? { variantRootIds: variantRootIds as any } : {}),
      },
    });
  }
}

/**
 * Replay a `{ originalProjectId → packages }` map (as embedded in a scoped
 * backup / project JSON export) into already-restored projects, remapping ids via
 * the caller's project + diagram id maps. Skips structurally-invalid packages and
 * projects that weren't restored. Returns how many studies were recreated. Must
 * run inside the caller's restore transaction.
 */
export async function replaySimulationPackages(
  tx: Tx,
  simPackages: Record<string, ExamplePackage[]> | undefined | null,
  projectIdMap: Map<string, string>,
  diagramIdMap: Map<string, string>,
  userId: string | null,
): Promise<number> {
  if (!simPackages) return 0;
  let n = 0;
  for (const [origProjectId, pkgs] of Object.entries(simPackages)) {
    const newProjectId = projectIdMap.get(origProjectId);
    if (!newProjectId) continue;
    for (const pkg of pkgs ?? []) {
      if (validateExamplePackage(pkg).length) continue;
      await adoptPackageInto(tx, pkg, { projectId: newProjectId, keyToDiagramId: diagramIdMap, userId });
      n++;
    }
  }
  return n;
}

export async function adoptPackage(pkg: ExamplePackage, ctx: AdoptCtx): Promise<{ projectId: string; openDiagramId: string | null }> {
  // One transaction so a partial failure never leaves a half-built project.
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: ctx.projectName, userId: ctx.userId, orgId: ctx.orgId, ownerName: ctx.ownerName, exampleType: "simulation", sourceExampleId: ctx.sourceExampleId ?? null },
    });

    // Diagrams — preserve `data`; pre-assign ids so a subprocess's
    // linkedDiagramId (a package KEY) rewrites to the new id before create.
    const keyToDiagramId = new Map<string, string>();
    for (const d of pkg.diagrams) keyToDiagramId.set(d.key, crypto.randomUUID());
    for (const d of pkg.diagrams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(JSON.stringify(d.data)) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const el of (data.elements ?? []) as any[]) {
        const linked = el.properties?.linkedDiagramId as string | undefined;
        if (linked && keyToDiagramId.has(linked)) el.properties.linkedDiagramId = keyToDiagramId.get(linked);
      }
      await tx.diagram.create({
        data: {
          id: keyToDiagramId.get(d.key)!, name: d.name, type: d.type || "bpmn",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: data as any,
          userId: ctx.userId, diagramOwnerId: ctx.userId, orgId: ctx.orgId, projectId: project.id,
        },
      });
    }

    // Library + study + scenarios (shared with the JSON/backup replay path).
    await adoptPackageInto(tx, pkg, { projectId: project.id, keyToDiagramId, userId: ctx.userId });

    const openDiagramId = pkg.study.rootKeys.map((k) => keyToDiagramId.get(k)).find(Boolean)
      ?? keyToDiagramId.values().next().value ?? null;
    return { projectId: project.id, openDiagramId };
  });
}
