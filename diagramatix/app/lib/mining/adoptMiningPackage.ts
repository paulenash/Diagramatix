/**
 * Adopt a portable MiningExamplePackage INTO a fresh project owned by the
 * caller — recreates the reference state-machine diagram(s) (element/connector
 * ids preserved so conformance-by-label + overlay ids stay valid) and a ready
 * ProcessMiningRun (mapping + compressed variants + performance + stats), with
 * the run's `referenceSmId` remapped to the freshly-minted diagram id. The user
 * lands in DiagramatixMINER with the run present — Discover / Conformance /
 * Calibrate & simulate all work immediately. The inverse of captureMiningPackage.
 *
 * Mirrors app/lib/simulation/adoptPackage.ts.
 */
import { prisma } from "@/app/lib/db";
import type { MiningExamplePackage, MiningExampleRun } from "./examplePackage";

export interface AdoptMiningCtx {
  userId: string;
  orgId: string;
  ownerName: string;
  projectName: string;
  sourceExampleId?: string;
}

export interface AdoptMiningResult {
  projectId: string;
  projectName: string;
  openDiagramId: string | null;
  /** Set when the run was pre-created (no sampleLog). */
  runId?: string | null;
  /** Set when the package ships a raw log — the console opens the Import panel
   *  pre-loaded with this instead of a pre-built run. */
  sampleLog?: MiningExamplePackage["sampleLog"];
  /** Set when the package ships several choosable scenarios — the console shows
   *  a scenario picker and pre-loads the default (last) one. */
  sampleLogs?: MiningExamplePackage["sampleLogs"];
}

export async function adoptMiningPackage(
  pkg: MiningExamplePackage,
  ctx: AdoptMiningCtx,
): Promise<AdoptMiningResult> {
  // One transaction so a partial failure never leaves a half-built project.
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: { name: ctx.projectName, userId: ctx.userId, orgId: ctx.orgId, ownerName: ctx.ownerName, exampleType: "mining", sourceExampleId: ctx.sourceExampleId ?? null },
    });

    // Reference diagrams — preserve `data`; pre-assign ids so the run's
    // referenceSmKey (a package KEY) can point at the new id.
    const keyToDiagramId = new Map<string, string>();
    for (const d of pkg.diagrams) keyToDiagramId.set(d.key, crypto.randomUUID());
    for (const d of pkg.diagrams) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(JSON.stringify(d.data)) as any;
      // Remap element links (the Domain Diagram's entity → discovered-state-machine
      // links, and any subprocess link) from captured ids to the freshly-minted ids.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const el of (data.elements ?? []) as any[]) {
        const linked = el.properties?.linkedDiagramId as string | undefined;
        if (linked && keyToDiagramId.has(linked)) el.properties.linkedDiagramId = keyToDiagramId.get(linked);
      }
      await tx.diagram.create({
        data: {
          id: keyToDiagramId.get(d.key)!, name: d.name, type: d.type || "state-machine",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: data as any,
          userId: ctx.userId, diagramOwnerId: ctx.userId, orgId: ctx.orgId, projectId: project.id,
        },
      });
    }

    // Simulation-twin library — project-scoped calendars then teams (created
    // once, shared across every per-object-type twin). Mirrors adoptPackage.
    const calendarNameToId = new Map<string, string>();
    for (const c of pkg.calendars ?? []) {
      const cal = await tx.simulationCalendar.create({ data: { name: c.name, projectId: project.id } });
      calendarNameToId.set(c.name, cal.id);
      await tx.$executeRaw`UPDATE "SimulationCalendar" SET pattern = ${JSON.stringify(c.pattern ?? { intervals: [] })}::jsonb WHERE id = ${cal.id}`;
    }
    for (const t of pkg.teams ?? []) {
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

    // Recreate a run's calibrated twin: the SimulationStudy rooted at the run's
    // freshly-minted discovered BPMN + its scenarios, then link the run to it.
    const createTwin = async (r: MiningExampleRun, runId: string) => {
      if (!r.twin || !r.discoveredBpmnKey) return;
      const bpmnId = keyToDiagramId.get(r.discoveredBpmnKey);
      if (!bpmnId) return;
      const study = await tx.simulationStudy.create({ data: { name: r.twin.studyName, projectId: project.id, createdById: ctx.userId } });
      await tx.simulationStudyRoot.create({ data: { studyId: study.id, diagramId: bpmnId } });
      for (const sc of r.twin.scenarios) {
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
      await tx.processMiningRun.update({ where: { id: runId }, data: { discoveredBpmnId: bpmnId, studyId: study.id } });
    };

    // OCEL study — recreate every per-object-type run, cross-linked to the shared
    // Domain Diagram + each run's discovered/reference state machine (all freshly
    // minted above). A new ocelGroupId ties the adopted study together.
    if (pkg.runs?.length) {
      const domainDiagramId = pkg.domainDiagramKey ? keyToDiagramId.get(pkg.domainDiagramKey) ?? null : null;
      const ocelGroupId = crypto.randomUUID();
      let firstRunId: string | null = null;
      for (const r of pkg.runs) {
        const refId = r.referenceSmKey ? keyToDiagramId.get(r.referenceSmKey) ?? null : null;
        const smId = r.discoveredSmKey ? keyToDiagramId.get(r.discoveredSmKey) ?? null : null;
        const run = await tx.processMiningRun.create({
          data: { name: r.name, projectId: project.id, orgId: ctx.orgId, createdById: ctx.userId, referenceSmId: refId, discoveredSmId: smId, ocelGroupId, objectType: r.objectType ?? null, domainDiagramId },
        });
        await tx.$executeRaw`UPDATE "ProcessMiningRun" SET mapping = ${JSON.stringify(r.mapping)}::jsonb, stats = ${JSON.stringify(r.stats)}::jsonb, variants = ${JSON.stringify(r.variants)}::jsonb, performance = ${JSON.stringify(r.performance)}::jsonb, governance = ${r.governance ? JSON.stringify(r.governance) : null}::jsonb, "updatedAt" = NOW() WHERE id = ${run.id}`;
        await createTwin(r, run.id);
        firstRunId ??= run.id;
      }
      // Open the object model (Domain Diagram) — the study's home.
      return { projectId: project.id, projectName: project.name, runId: firstRunId, openDiagramId: domainDiagramId ?? keyToDiagramId.values().next().value ?? null };
    }

    const referenceSmId = pkg.run.referenceSmKey ? keyToDiagramId.get(pkg.run.referenceSmKey) ?? null : null;
    const openDiagramId = referenceSmId ?? keyToDiagramId.values().next().value ?? null;

    // With a sampleLog, DON'T pre-create the run — the user imports it in the
    // console (confirm-the-analysis flow). Otherwise recreate the run as usual.
    if (pkg.sampleLog || pkg.sampleLogs?.length) {
      return { projectId: project.id, projectName: project.name, openDiagramId, sampleLog: pkg.sampleLog, sampleLogs: pkg.sampleLogs };
    }

    // The run — scalars via Prisma, the four JSON columns via raw SQL (Prisma 7
    // omits ProcessMiningRun JSON writes from model inputs; matches the import route).
    const r = pkg.run;
    const run = await tx.processMiningRun.create({
      data: { name: r.name, projectId: project.id, orgId: ctx.orgId, createdById: ctx.userId, referenceSmId },
    });
    await tx.$executeRaw`UPDATE "ProcessMiningRun" SET mapping = ${JSON.stringify(r.mapping)}::jsonb, stats = ${JSON.stringify(r.stats)}::jsonb, variants = ${JSON.stringify(r.variants)}::jsonb, performance = ${JSON.stringify(r.performance)}::jsonb, governance = ${r.governance ? JSON.stringify(r.governance) : null}::jsonb, "updatedAt" = NOW() WHERE id = ${run.id}`;
    await createTwin(r, run.id);

    return { projectId: project.id, projectName: project.name, runId: run.id, openDiagramId };
  });
}
