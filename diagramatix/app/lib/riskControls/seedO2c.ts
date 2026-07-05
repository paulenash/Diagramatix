/**
 * Create the Order-to-Cash sample GRC library (O2C_SAMPLE) under a given scope —
 * an Org master OR a Project copy. Shared by the org-master seed
 * (scripts/seed-risk-controls-o2c.ts) and the self-contained demo project seed
 * (scripts/seed-o2c-demo.ts). Takes a Prisma client/tx so the caller controls
 * the transaction; kept generic (`tx: any`) so this stays free of a hard Prisma
 * client import.
 */
import { O2C_SAMPLE, type SampleItem } from "./o2cSample";

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

/** Create the O2C sample library + its items + traceability links under `scope`.
 *  Returns the new library id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createO2cLibrary(tx: any, scope: { orgId?: string; projectId?: string }): Promise<string> {
  const lib = await tx.riskControlLibrary.create({ data: { name: O2C_SAMPLE.name, ...scope } });
  const idByCode = new Map<string, string>();
  const sort: Record<string, number> = {};
  for (const it of O2C_SAMPLE.items) {
    const so = (sort[it.kind] = (sort[it.kind] ?? -1) + 1);
    const row = await tx.riskControlItem.create({ data: itemData(lib.id, it, so) });
    idByCode.set(it.code, row.id);
  }
  for (const ln of O2C_SAMPLE.links) {
    const s = idByCode.get(ln.source), t = idByCode.get(ln.target);
    if (s && t) await tx.riskControlLink.create({ data: { libraryId: lib.id, sourceId: s, targetId: t } });
  }
  return lib.id;
}
