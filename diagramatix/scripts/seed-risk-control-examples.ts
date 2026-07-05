/**
 * Seed the Risk & Control (GRC) example catalog with the Order-to-Cash example —
 * the real O2C project diagrams + the O2C GRC library + the O2C mining run — as a
 * PUBLISHED, one-click-adoptable RiskControlExample. Upsert by slug (re-running
 * refreshes the bundled content). Mirrors seed-mining-examples.ts.
 *
 * Run: DATABASE_URL="<url>" npx tsx scripts/seed-risk-control-examples.ts
 */
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { O2C_SAMPLE, O2C_ATTACH } from "../app/lib/riskControls/o2cSample";
import { STARTER_MINING_EXAMPLES } from "../app/lib/mining/exampleSeeds";
import type { RiskControlExamplePackage } from "../app/lib/riskControls/examplePackage";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import projectExport from "../app/lib/riskControls/o2cProjectExport.json";

/** Build the Order-to-Cash GRC example package (shared with the demo-project seed). */
export function buildO2cExamplePackage(): RiskControlExamplePackage {
  const mining = STARTER_MINING_EXAMPLES.find((e) => e.slug === "order-to-cash-lifecycle");
  if (!mining) throw new Error("O2C mining example not found — run gen-mining-examples.ts first.");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const diagrams = (projectExport as any).diagrams.map((d: any) => ({ name: d.name, type: d.type, data: d.data, colorConfig: d.colorConfig, displayMode: d.displayMode }));
  // The reference State Machine is the project's OWN order-lifecycle diagram, so
  // the mining run conforms against the exact SM in the project (not a duplicate).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sm = diagrams.find((d: any) => d.type === "state-machine");
  return {
    version: 1,
    diagrams,
    library: { name: O2C_SAMPLE.name, items: O2C_SAMPLE.items, links: O2C_SAMPLE.links },
    attach: O2C_ATTACH,
    mining: sm ? { referenceDiagramName: sm.name, run: mining.package.run } : undefined,
  };
}

const EXAMPLE = {
  slug: "order-to-cash-grc",
  title: "Order-to-Cash — Governance & Controls",
  concept: "A full Order-to-Cash process with Risks & Controls on the real steps, and control effectiveness proven from a mined event log.",
  description: [
    "The genuine Order-to-Cash project — value chain, context, ArchiMate and ~11 BPMN sub-processes (Receive Order, Validate Customer, Check Credit & Pricing, Fulfil, Receive Payment, Reconcile, Disputes, Close…) — with **Risks and Controls attached to the real activities**.",
    "",
    "Adopt it and open **◆ Risk & Controls**: browse the GRC catalog (risks, controls, policies, regulations, audit findings, KRIs, KPIs and their traceability), export the **Risk-Control Matrix**, and see each control's **operating effectiveness** — bypassed in N of 200 cases — computed from the bundled mining run's conformance. The perfect end-to-end demo of governance on a live process.",
  ].join("\n"),
  difficulty: "core",
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error("DATABASE_URL not set"); process.exit(1); }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const pkg = buildO2cExamplePackage();
    const existing = await prisma.riskControlExample.findUnique({ where: { slug: EXAMPLE.slug } });
    const data = {
      title: EXAMPLE.title, concept: EXAMPLE.concept, description: EXAMPLE.description, difficulty: EXAMPLE.difficulty,
      published: true, sortOrder: 10,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      package: pkg as any,
    };
    if (existing) { await prisma.riskControlExample.update({ where: { slug: EXAMPLE.slug }, data }); console.log(`Refreshed "${EXAMPLE.title}" (${pkg.diagrams.length} diagrams, ${pkg.library.items.length} items).`); }
    else { await prisma.riskControlExample.create({ data: { slug: EXAMPLE.slug, ...data } }); console.log(`Created "${EXAMPLE.title}" (${pkg.diagrams.length} diagrams, ${pkg.library.items.length} items).`); }
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when invoked directly (not when imported by the demo seed).
if (process.argv[1] && /seed-risk-control-examples\.ts$/.test(process.argv[1])) {
  main().catch((err) => { console.error(err); process.exit(1); });
}
