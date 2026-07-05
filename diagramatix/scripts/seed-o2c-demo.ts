/**
 * Seed a SELF-CONTAINED Order-to-Cash demo project, RECONSTITUTED from the real
 * Order-to-Cash project export (app/lib/riskControls/o2cProjectExport.json) so the
 * demo shows the genuine process diagrams — value chain, context, ArchiMate and
 * ~11 BPMN sub-processes — with:
 *   • Risks + Controls attached to the REAL process steps,
 *   • the Order lifecycle reference State Machine + a saved mining run with
 *     CONFORMANCE already computed,
 *   • the Order-to-Cash GRC library (project copy) whose controls carry the
 *     monitor signatures for the run's deviations.
 * Open the project → ◆ Risk & Controls and the controls show operating
 * effectiveness ("bypassed in N of 200 cases") straight away; the audit-grid
 * export lists the real activity names.
 *
 * Targets the first Owner/Admin org of RC_SEED_EMAIL (default paul@nashcc.com.au).
 * Idempotent: skips if the reconstituted demo already exists; upgrades the older
 * synthetic demo in place.
 *
 * Run: DATABASE_URL="<url>" npx tsx scripts/seed-o2c-demo.ts
 */
import { prisma, pgPool } from "../app/lib/db";
import { STARTER_MINING_EXAMPLES } from "../app/lib/mining/exampleSeeds";
import { checkTransitionConformance, type ReferenceSm } from "../app/lib/mining/transitionConformance";
import { createO2cLibrary } from "../app/lib/riskControls/seedO2c";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import projectExport from "../app/lib/riskControls/o2cProjectExport.json";

const EMAIL = process.env.RC_SEED_EMAIL || "paul@nashcc.com.au";
const PROJECT_NAME = "Order-to-Cash — GRC Demo";

/** Real step label → the Risk / Control codes it carries. */
const ATTACH: Record<string, { risks?: string[]; controls?: string[] }> = {
  "Capture order details": { risks: ["R-01"], controls: ["C-01"] },
  "Log Order Details": { risks: ["R-01"], controls: ["C-01"] },
  "Record order in OMS": { risks: ["R-01"], controls: ["C-01"] },
  "Record Order Formally": { risks: ["R-01"], controls: ["C-01"] },
  "Check order against duplicates / existing customer": { risks: ["R-04"], controls: ["C-04"] },
  "Check Duplicate and Customer Match": { risks: ["R-04"], controls: ["C-04"] },
  "Set Up Customer Record": { risks: ["R-09"], controls: ["C-10"] },
  "Apply contract / discount pricing": { risks: ["R-02"], controls: ["C-02"] },
  "Confirm final price and credit terms": { controls: ["C-02"] },
  "Check credit limit and exposure": { risks: ["R-03"], controls: ["C-03"] },
  "Credit Officer review": { controls: ["C-07"] },
  "Request prepayment / hold order": { risks: ["R-03"], controls: ["C-07"] },
  "Escalate to Credit Manager": { controls: ["C-07"] },
  "Pick items": { risks: ["R-06"], controls: ["C-06"] },
  "Pack and label": { controls: ["C-06"] },
  "Stage for dispatch and update WMS": { risks: ["R-05"], controls: ["C-05"] },
  "Quality check": { controls: ["C-05"] },
  "Match payments to invoices": { risks: ["R-08"], controls: ["C-09"] },
  "Record payment against invoice": { risks: ["R-08"], controls: ["C-09"] },
  "Investigate and allocate": { controls: ["C-09"] },
  "Investigate Dispute / Deduction": { risks: ["R-10"], controls: ["C-11"] },
  "Log Case": { controls: ["C-11"] },
};

type CodeMap = Map<string, { id: string; code: string; name: string }>;
type Ref = { itemId: string; code: string; label: string };

/** Inject element.properties.risk onto the mapped steps of a diagram's data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function attachRefs(data: any, codeMap: CodeMap): { data: any; attached: number } {
  let attached = 0;
  const toRefs = (codes?: string[]): Ref[] => (codes ?? []).map((c) => codeMap.get(c)).filter(Boolean).map((it) => ({ itemId: it!.id, code: it!.code, label: it!.name }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const el of (data?.elements ?? []) as any[]) {
    const m = ATTACH[el.label];
    if (!m) continue;
    const riskRefs = toRefs(m.risks), controlRefs = toRefs(m.controls);
    if (!riskRefs.length && !controlRefs.length) continue;
    el.properties = { ...(el.properties ?? {}), risk: { ...(riskRefs.length ? { riskRefs } : {}), ...(controlRefs.length ? { controlRefs } : {}) } };
    attached++;
  }
  return { data, attached };
}

async function removeOldProject(projectId: string) {
  await prisma.riskControlLibrary.deleteMany({ where: { projectId } });
  await prisma.processMiningRun.deleteMany({ where: { projectId } });
  await prisma.diagram.deleteMany({ where: { projectId } });
  await prisma.project.delete({ where: { id: projectId } });
}

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true, name: true } });
  if (!user) { console.log(`No user "${EMAIL}" — nothing to seed.`); return; }
  const membership = await prisma.orgMember.findFirst({ where: { userId: user.id, role: { in: ["Owner", "Admin"] } }, select: { orgId: true } });
  if (!membership) { console.log(`"${EMAIL}" owns/admins no org — nothing to seed.`); return; }
  const orgId = membership.orgId;

  const existing = await prisma.project.findFirst({ where: { name: PROJECT_NAME, userId: user.id }, select: { id: true, diagrams: { select: { name: true } } } });
  if (existing) {
    if (existing.diagrams.some((d) => /Value Chain/i.test(d.name))) { console.log(`Skip — "${PROJECT_NAME}" already reconstituted.`); return; }
    console.log(`Upgrading the older synthetic "${PROJECT_NAME}" → reconstituting from the real project…`);
    await removeOldProject(existing.id);
  }

  const ex = STARTER_MINING_EXAMPLES.find((e) => e.slug === "order-to-cash-lifecycle");
  if (!ex) { console.log("O2C mining example not found — run gen-mining-examples.ts first."); return; }

  // 1) Project.
  const project = await prisma.project.create({ data: { name: PROJECT_NAME, userId: user.id, orgId, ownerName: user.name ?? "" } });

  // 2) GRC library (project copy) → resolve code → item.
  const libraryId = await prisma.$transaction((tx) => createO2cLibrary(tx, { projectId: project.id }));
  const items = await prisma.riskControlItem.findMany({ where: { libraryId }, select: { id: true, code: true, name: true } });
  const codeMap: CodeMap = new Map(items.map((i) => [i.code, i]));

  // 3) Import the real diagrams, attaching risks/controls to the real steps.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diags = (projectExport as any).diagrams as any[];
  let totalAttached = 0;
  for (const d of diags) {
    const { data, attached } = attachRefs(d.data, codeMap);
    totalAttached += attached;
    await prisma.diagram.create({
      data: {
        name: d.name, type: d.type ?? "context", userId: user.id, diagramOwnerId: user.id, orgId, projectId: project.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: data as any,
        colorConfig: d.colorConfig ?? undefined, displayMode: d.displayMode ?? undefined,
      },
    });
  }

  // 4) Reference State Machine (order lifecycle) for conformance.
  const refEx = ex.package.diagrams[0];
  const refDiag = await prisma.diagram.create({
    data: {
      name: refEx.name, type: "state-machine", userId: user.id, diagramOwnerId: user.id, orgId, projectId: project.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: refEx.data as any,
    },
  });

  // 5) Mining run + conformance (JSON via raw SQL, Prisma-7 pattern).
  const mrun = ex.package.run;
  const conf = checkTransitionConformance(mrun.variants, { elements: refEx.data.elements, connectors: refEx.data.connectors } as ReferenceSm);
  const run = await prisma.processMiningRun.create({ data: { name: mrun.name, projectId: project.id, orgId, createdById: user.id, referenceSmId: refDiag.id } });
  await pgPool.query(
    'UPDATE "ProcessMiningRun" SET mapping=$1::jsonb, stats=$2::jsonb, variants=$3::jsonb, performance=$4::jsonb, conformance=$5::jsonb, "updatedAt"=NOW() WHERE id=$6',
    [JSON.stringify(mrun.mapping), JSON.stringify(mrun.stats), JSON.stringify(mrun.variants), JSON.stringify(mrun.performance), JSON.stringify(conf), run.id],
  );

  console.log(`Seeded "${PROJECT_NAME}" (project ${project.id}):`);
  console.log(`  • ${diags.length} real Order-to-Cash diagrams imported; risks/controls attached to ${totalAttached} steps`);
  console.log(`  • reference State Machine + mining run — conformance ${conf.conformingCases}/${conf.totalCases} (${(conf.fitness * 100).toFixed(0)}% fitness)`);
  console.log(`  • Order-to-Cash GRC library adopted; controls pre-mapped to the run's deviations`);
  console.log(`  Open it → ◆ Risk & Controls to see control operating-effectiveness.`);
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => pgPool.end?.());
