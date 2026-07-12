import "dotenv/config";
import { prisma } from "../app/lib/db";

/**
 * e2e ONLY — lift the Free-tier subscription caps in the test DB so the e2e
 * account (a Free user) can create ArchiMate diagrams, many diagrams, and AI
 * attempts without hitting limits. `null` = unlimited. Also turns ON all four
 * feature entitlements (Simulator / Process Mining / Risk-Control+Compliance /
 * APQC) so the Free e2e account can exercise those features and their example
 * galleries — production Free has them OFF, but the e2e suite covers them.
 * Runs from scripts/e2e-server.cjs against diagramatix_test (DATABASE_URL is set
 * there and wins over .env). Never run against prod.
 */
async function main() {
  await prisma.subscriptionLevel.update({
    where: { id: "free" },
    data: {
      maxArchimateDiagramsTotal: null,
      maxAiAttempts: null,
      maxProjects: null,
      maxDiagramsPerTypePerProject: null,
      hasSimulator: true,
      hasProcessMining: true,
      hasRiskControl: true,
      hasApqc: true,
    },
  });
  console.log(`[e2e] lifted Free-tier caps + enabled all features in ${process.env.DATABASE_URL}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
