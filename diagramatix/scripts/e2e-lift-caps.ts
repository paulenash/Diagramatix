import "dotenv/config";
import { prisma } from "../app/lib/db";

/**
 * e2e ONLY — lift the Free-tier subscription caps in the test DB so the e2e
 * account (a Free user) can create ArchiMate diagrams, many diagrams, and AI
 * attempts without hitting limits. `null` = unlimited. Runs from
 * scripts/e2e-server.cjs against diagramatix_test (DATABASE_URL is set there and
 * wins over .env). Never run against prod.
 */
async function main() {
  await prisma.subscriptionLevel.update({
    where: { id: "free" },
    data: {
      maxArchimateDiagramsTotal: null,
      maxAiAttempts: null,
      maxProjects: null,
      maxDiagramsPerTypePerProject: null,
    },
  });
  console.log(`[e2e] lifted Free-tier caps in ${process.env.DATABASE_URL}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
