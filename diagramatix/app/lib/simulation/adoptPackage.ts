/**
 * Adopt a portable ExamplePackage INTO a fresh project owned by the caller —
 * recreates the diagrams (element/connector ids preserved so sim params +
 * interventions stay valid; linkedDiagramId + study roots + variant roots
 * remapped to the freshly-minted diagram ids), the team library, the calendar
 * library, and the study + scenarios. The inverse of captureProjectPackage;
 * shared by the example "adopt" route AND the user-facing "Import simulation".
 */
import { prisma } from "@/app/lib/db";
import type { ExamplePackage } from "./examplePackage";

export interface AdoptCtx {
  userId: string;
  orgId: string;
  ownerName: string;
  projectName: string;
}

export async function adoptPackage(pkg: ExamplePackage, ctx: AdoptCtx): Promise<{ projectId: string; openDiagramId: string | null }> {
  // One transaction so a partial failure never leaves a half-built project.
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: ctx.projectName, userId: ctx.userId, orgId: ctx.orgId, ownerName: ctx.ownerName },
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

    // Working-calendar library (create first so teams can reference by id).
    const calendarNameToId = new Map<string, string>();
    for (const c of pkg.calendars ?? []) {
      const cal = await tx.simulationCalendar.create({ data: { name: c.name, projectId: project.id } });
      calendarNameToId.set(c.name, cal.id);
      await tx.$executeRaw`UPDATE "SimulationCalendar" SET pattern = ${JSON.stringify(c.pattern ?? { intervals: [] })}::jsonb WHERE id = ${cal.id}`;
    }

    // Team library (link each team to its calendar by name → new id).
    for (const t of pkg.teams) {
      await tx.simulationTeam.create({
        data: {
          name: t.name, projectId: project.id,
          capacity: Math.max(1, Math.round(t.capacity ?? 1)),
          costPerHour: t.costPerHour ?? null,
          efficiency: t.efficiency && t.efficiency > 0 ? t.efficiency : 1,
          calendarId: t.calendarName ? calendarNameToId.get(t.calendarName) ?? null : null,
        },
      });
    }

    // Study + roots (remap package keys → new diagram ids).
    const study = await tx.simulationStudy.create({ data: { name: pkg.study.name, projectId: project.id, createdById: ctx.userId } });
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

    const openDiagramId = pkg.study.rootKeys.map((k) => keyToDiagramId.get(k)).find(Boolean)
      ?? keyToDiagramId.values().next().value ?? null;
    return { projectId: project.id, openDiagramId };
  });
}
