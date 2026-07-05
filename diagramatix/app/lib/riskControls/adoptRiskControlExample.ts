/**
 * Adopt a Risk & Control (GRC) example into a FRESH project owned by the caller:
 * import the process diagrams, create the GRC library, attach Risks/Controls to
 * the real steps, and — when the example ships a mining run — recreate the
 * reference State Machine + a saved ProcessMiningRun with conformance so control
 * operating-effectiveness shows immediately. Mirrors adoptMiningPackage.
 *
 * Extracted from the route so it can be unit-tested + reused by the demo seed.
 */
import { prisma, pgPool } from "@/app/lib/db";
import { createLibraryFrom } from "./seedO2c";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import type { RiskControlExamplePackage } from "./examplePackage";

export interface AdoptRcExampleCtx { userId: string; orgId: string; ownerName: string; projectName: string; }
export interface AdoptRcExampleResult { projectId: string; projectName: string; openDiagramId: string | null; }

type Ref = { itemId: string; code: string; label: string };

/** Inject element.properties.risk onto the mapped steps of a diagram's data. */
function attachRefs(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any,
  attach: RiskControlExamplePackage["attach"],
  itemByCode: Map<string, { id: string; code: string; name: string }>,
): number {
  let attached = 0;
  const toRefs = (codes?: string[]): Ref[] => (codes ?? []).map((c) => itemByCode.get(c)).filter(Boolean).map((it) => ({ itemId: it!.id, code: it!.code, label: it!.name }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of (data?.elements ?? []) as any[]) {
    const m = attach[el.label];
    if (!m) continue;
    const riskRefs = toRefs(m.risks), controlRefs = toRefs(m.controls);
    if (!riskRefs.length && !controlRefs.length) continue;
    el.properties = { ...(el.properties ?? {}), risk: { ...(riskRefs.length ? { riskRefs } : {}), ...(controlRefs.length ? { controlRefs } : {}) } };
    attached++;
  }
  return attached;
}

export async function adoptRiskControlExample(pkg: RiskControlExamplePackage, ctx: AdoptRcExampleCtx): Promise<AdoptRcExampleResult> {
  // 1) Project.
  const project = await prisma.project.create({ data: { name: ctx.projectName, userId: ctx.userId, orgId: ctx.orgId, ownerName: ctx.ownerName } });

  // 2) GRC library → code → item.
  const { idByCode } = await prisma.$transaction((tx) => createLibraryFrom(tx, { projectId: project.id }, pkg.library));
  const items = await prisma.riskControlItem.findMany({ where: { library: { projectId: project.id } }, select: { id: true, code: true, name: true } });
  const itemByCode = new Map(items.map((i) => [i.code, i]));

  // 3) Import process diagrams, attaching risks/controls to the real steps.
  let openDiagramId: string | null = null;
  const diagIdByName = new Map<string, string>();
  for (const d of pkg.diagrams) {
    const data = JSON.parse(JSON.stringify(d.data));   // don't mutate the shared package
    attachRefs(data, pkg.attach, itemByCode);
    const created = await prisma.diagram.create({
      data: {
        name: d.name, type: d.type || "context", userId: ctx.userId, diagramOwnerId: ctx.userId, orgId: ctx.orgId, projectId: project.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any, colorConfig: d.colorConfig ?? undefined, displayMode: d.displayMode ?? undefined,
      },
    });
    diagIdByName.set(d.name, created.id);
    if (!openDiagramId && d.type === "bpmn") openDiagramId = created.id;
  }

  // 4) Mining run — conform against the imported reference State Machine (one of
  //    the package's own diagrams), so no duplicate reference is created.
  if (pkg.mining) {
    const m = pkg.mining;
    const refPkgDiag = pkg.diagrams.find((d) => d.name === m.referenceDiagramName && d.type === "state-machine")
      ?? pkg.diagrams.find((d) => d.type === "state-machine");
    const refSmId = refPkgDiag ? diagIdByName.get(refPkgDiag.name) : undefined;
    if (refPkgDiag && refSmId) {
      const conf = checkTransitionConformance(m.run.variants, { elements: refPkgDiag.data.elements, connectors: refPkgDiag.data.connectors } as ReferenceSm);
      const run = await prisma.processMiningRun.create({ data: { name: m.run.name, projectId: project.id, orgId: ctx.orgId, createdById: ctx.userId, referenceSmId: refSmId } });
      await pgPool.query(
        'UPDATE "ProcessMiningRun" SET mapping=$1::jsonb, stats=$2::jsonb, variants=$3::jsonb, performance=$4::jsonb, conformance=$5::jsonb, "updatedAt"=NOW() WHERE id=$6',
        [JSON.stringify(m.run.mapping), JSON.stringify(m.run.stats), JSON.stringify(m.run.variants), JSON.stringify(m.run.performance), JSON.stringify(conf), run.id],
      );
    }
  }

  return { projectId: project.id, projectName: project.name, openDiagramId };
}
