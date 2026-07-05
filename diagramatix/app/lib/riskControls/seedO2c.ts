/**
 * Create a GRC library (items + traceability links) under a given scope — an Org
 * master OR a Project copy — from a plain {name, items, links} spec. Shared by the
 * org-master seed, the demo-project seed, and the example-adopt flow. Takes a
 * Prisma client/tx so the caller controls the transaction; kept generic
 * (`tx: any`) so this stays free of a hard Prisma client import.
 */
import { O2C_SAMPLE, type SampleItem, type SampleLink } from "./o2cSample";

function itemData(libraryId: string, it: SampleItem, sortOrder: number) {
  const isRisk = it.kind === "Risk", isControl = it.kind === "Control", generic = !isRisk;
  return {
    libraryId, kind: it.kind, code: it.code, name: it.name, sortOrder,
    description: it.description ?? null,
    likelihood: isRisk ? it.likelihood ?? null : null,
    impact: isRisk ? it.impact ?? null : null,
    riskCategory: isRisk ? it.riskCategory ?? null : null,
    residualLikelihood: isRisk ? it.residualLikelihood ?? null : null,
    residualImpact: isRisk ? it.residualImpact ?? null : null,
    controlType: isControl ? it.controlType ?? null : null,
    automation: isControl ? it.automation ?? null : null,
    frequency: isControl ? it.frequency ?? null : null,
    owner: generic ? it.owner ?? null : null,
    frameworkRef: generic ? it.frameworkRef ?? null : null,
    evidence: isControl ? it.evidence ?? null : null,
    testMethod: isControl ? it.testMethod ?? null : null,
    testFrequency: isControl ? it.testFrequency ?? null : null,
    monitorSignature: isControl ? it.monitorSignature ?? null : null,
  };
}

export interface LibrarySpec { name: string; items: SampleItem[]; links: SampleLink[]; }

/** Create a GRC library + its items + traceability links under `scope`.
 *  Returns the new library id + a code → item-id map (for step attachment). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createLibraryFrom(tx: any, scope: { orgId?: string; projectId?: string }, sample: LibrarySpec): Promise<{ libraryId: string; idByCode: Map<string, string> }> {
  const lib = await tx.riskControlLibrary.create({ data: { name: sample.name, ...scope } });
  const idByCode = new Map<string, string>();
  const sort: Record<string, number> = {};
  for (const it of sample.items) {
    const so = (sort[it.kind] = (sort[it.kind] ?? -1) + 1);
    const row = await tx.riskControlItem.create({ data: itemData(lib.id, it, so) });
    idByCode.set(it.code, row.id);
  }
  for (const ln of sample.links) {
    const s = idByCode.get(ln.source), t = idByCode.get(ln.target);
    if (s && t) await tx.riskControlLink.create({ data: { libraryId: lib.id, sourceId: s, targetId: t } });
  }
  return { libraryId: lib.id, idByCode };
}

/** Convenience: create the Order-to-Cash sample library under `scope`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createO2cLibrary(tx: any, scope: { orgId?: string; projectId?: string }): Promise<string> {
  const { libraryId } = await createLibraryFrom(tx, scope, O2C_SAMPLE);
  return libraryId;
}
