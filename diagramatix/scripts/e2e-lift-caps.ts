import "dotenv/config";
import { prisma } from "../app/lib/db";
import { registerUser } from "../app/lib/auth/registerUser";
import { E2E_USER } from "../e2e/_user";

/**
 * e2e ONLY — lift the Free-tier subscription caps in the test DB so the e2e
 * account (a Free user) can create ArchiMate diagrams, many diagrams, and AI
 * attempts without hitting limits. `null` = unlimited. Also turns ON all four
 * feature entitlements (Simulator / Process Mining / Risk-Control+Compliance /
 * APQC) so the Free e2e account can exercise those features and their example
 * galleries — production Free has them OFF, but the e2e suite covers them.
 * Runs from scripts/e2e-server.cjs against diagramatix_test (DATABASE_URL is set
 * there and wins over .env). Never run against prod.
 *
 * The e2e account is also created HERE, on Expert: Free and Introductory are examples-only plans
 * (features/exampleAccess.ts) and the suite exercises the Simulator and Process Mining on projects it
 * creates itself. auth.setup.ts then finds the account already registered (409 is accepted).
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
  const reg = await registerUser({ email: E2E_USER.email, name: E2E_USER.name, password: E2E_USER.password });
  if (!reg.ok && reg.status !== 409) throw new Error(`e2e account: ${reg.error}`);
  await prisma.user.update({ where: { email: E2E_USER.email }, data: { subscriptionLevelId: "expert" } });
  console.log(`[e2e] lifted Free-tier caps + enabled all features in ${process.env.DATABASE_URL}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
