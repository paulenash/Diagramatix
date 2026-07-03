/**
 * e2e app server for Playwright.
 *
 * Builds WITHOUT standalone output (NEXT_OUTPUT_STANDALONE=false makes
 * next.config drop `output: "standalone"`) so a plain `next start` serves the
 * build — `next start` does not serve a standalone build — then starts on :3001
 * against the diagramatix_test database. AUTH_SECRET etc. come from .env (Next
 * loads it but never overrides the vars set here).
 */
const { spawnSync, spawn } = require("node:child_process");

const env = {
  ...process.env,
  NEXT_OUTPUT_STANDALONE: "false",
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/diagramatix_test",
  AUTH_TRUST_HOST: "true",
  PORT: "3001",
};

function step(label, command) {
  console.log(`[e2e-server] ${label} …`);
  const r = spawnSync(command, { stdio: "inherit", env, shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// Schema + reference data the app needs but the unit suite truncates away
// (it leaves diagramatix_test without the SubscriptionLevel catalog that
// registerUser's `subscriptionLevelId: "free"` references).
step("applying schema to diagramatix_test", `npx prisma db push --accept-data-loss --url "${env.DATABASE_URL}"`);
step("seeding subscription levels", "npx --yes tsx@4 scripts/seed-subscriptions.ts");
// The DiagramatixMINER Examples gallery needs its catalog, like subscriptions.
step("seeding mining example catalog", "npx --yes tsx@4 scripts/seed-mining-examples.ts");
// A known SuperAdmin account so the admin-surface specs can sign in (test DB only).
step("seeding e2e superadmin (test DB only)", "npx --yes tsx@4 scripts/e2e-seed-superadmin.ts");

// Lift the Free-tier caps in the TEST DB ONLY so the e2e account (a Free user)
// can create ArchiMate diagrams + many diagrams + AI attempts. Never touches prod.
step("lifting Free-tier caps (test DB only)", "npx --yes tsx@4 scripts/e2e-lift-caps.ts");

step("building (non-standalone)", "npx next build");

console.log("[e2e-server] starting http://localhost:3001 against diagramatix_test");
const server = spawn("npx next start -p 3001", { stdio: "inherit", env, shell: true });
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGINT"));
