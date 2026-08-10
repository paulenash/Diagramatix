/**
 * Add ONLY the Enterprise SubscriptionLevel row — surgical, prod-safe.
 *
 * Unlike seed-subscriptions.ts this does NOT:
 *   • grandfather NULL-tier users to Expert, and
 *   • rewrite (factory-reset) the other tiers' price/limit columns.
 * It upserts the single `enterprise` row so the Feature Availability grid
 * gets its 5th column and the matrix seed can reference it. Idempotent.
 *
 * Run (PROD):
 *   cd diagramatix
 *   export PATH="$PATH:/c/Program Files/nodejs"
 *   DATABASE_URL="<PROD_CONNECTION_STRING>" npx tsx scripts/add-enterprise-tier.ts
 */
import "dotenv/config";
import { prisma } from "../app/lib/db";

const ENTERPRISE = {
  name: "Enterprise",
  priceMonthly: 0, // AUD cents; Stripe price set later
  sortOrder: 4,
  maxProjects: null,
  maxDiagramsPerTypePerProject: null,
  maxArchimateDiagramsTotal: null,
  maxNonBpmnElementsPerDiagram: null,
  maxBpmnElementsPerDiagram: null,
  maxAiAttempts: null,
  aiAttemptsResetMonthly: true,
  maxIndividualExports: null,
  individualExportsResetMonthly: true,
  maxIndividualImports: null,
  individualImportsResetMonthly: true,
  maxBulkExports: null,
  maxBulkImports: null,
  trialDays: null,
  hasSimulator: true,
  hasProcessMining: true,
  hasRiskControl: true,
  hasApqc: true,
};

function targetHost(): string {
  try { const u = new URL(process.env.DATABASE_URL ?? ""); return `${u.host}/${u.pathname.replace(/^\//, "")}`; }
  catch { return "(DATABASE_URL not set!)"; }
}

async function main() {
  console.log(`→ Connected to: ${targetHost()}`);
  const host = targetHost();
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    console.log("  ⚠ This is your LOCAL database. If you meant prod, the DATABASE_URL env var is not set for this process.");
  }
  const before = await prisma.subscriptionLevel.findUnique({ where: { id: "enterprise" }, select: { id: true } });
  await prisma.subscriptionLevel.upsert({
    where: { id: "enterprise" },
    create: { id: "enterprise", ...ENTERPRISE },
    update: ENTERPRISE,
  });
  console.log(before ? "✔ Enterprise tier already existed — refreshed." : "✔ Enterprise tier created.");

  const levels = await prisma.subscriptionLevel.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, sortOrder: true } });
  console.log("Levels now:", levels.map((l) => `${l.sortOrder}:${l.id}`).join("  "));
  console.log("(No users touched, no other tiers modified.)");
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
