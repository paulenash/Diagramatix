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

// Each step announces itself and reports how long it took.
//
// When Playwright's webServer budget expires it says only "Timed out waiting
// Nms" — it cannot say WHICH step ate the time, and on 2026-09-04 two CI runs
// failed exactly that way with nothing in the log to act on. An elapsed time
// per step turns the next one into a reading rather than an investigation:
// "building 280s" is a slow runner, "db push 200s" is something else entirely.
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

function step(label, command) {
  const started = Date.now();
  console.log(`[e2e-server] ${label} … (at ${since()})`);
  const r = spawnSync(command, { stdio: "inherit", env, shell: true });
  const took = `${((Date.now() - started) / 1000).toFixed(1)}s`;
  if (r.status !== 0) {
    console.error(`[e2e-server] FAILED after ${took}: ${label}`);
    process.exit(r.status ?? 1);
  }
  console.log(`[e2e-server] ${label} — done in ${took}`);
}

// Fetch tsx ONCE.
//
// Every seed below used `npx --yes tsx@4`, and `--yes` re-resolves and
// re-downloads tsx from the registry on each call. The per-step timings added
// alongside this made the cost visible the first time they ran in CI:
//
//     applying schema to diagramatix_test — done in 1.7s
//     seeding subscription levels        — done in 134.2s
//     seeding mining example catalog     — done in 213.4s
//     seeding e2e superadmin             — done in 142.3s
//
// The database was answering in under two seconds while each tsx fetch cost
// two to three and a half MINUTES, and the server never reached `next build`
// before Playwright's budget expired — three CI runs in a row, reported only as
// "Timed out waiting from config.webServer". The deploy workflow had the same
// bug in 32 places (680fc8fb).
step("installing tsx once", "npm install --global tsx@4");

// Schema + reference data the app needs but the unit suite truncates away
// (it leaves diagramatix_test without the SubscriptionLevel catalog that
// registerUser's `subscriptionLevelId: "free"` references).
step("applying schema to diagramatix_test", `npx prisma db push --accept-data-loss --url "${env.DATABASE_URL}"`);
step("seeding subscription levels", "tsx scripts/seed-subscriptions.ts");
// The DiagramatixMINER Examples gallery needs its catalog, like subscriptions.
step("seeding mining example catalog", "tsx scripts/seed-mining-examples.ts");
// A known SuperAdmin account so the admin-surface specs can sign in (test DB only).
step("seeding e2e superadmin (test DB only)", "tsx scripts/e2e-seed-superadmin.ts");

// Lift the Free-tier caps in the TEST DB ONLY so the e2e account (a Free user)
// can create ArchiMate diagrams + many diagrams + AI attempts. Never touches prod.
step("lifting Free-tier caps (test DB only)", "tsx scripts/e2e-lift-caps.ts");

step("building (non-standalone)", "npx next build");

console.log(`[e2e-server] starting http://localhost:3001 against diagramatix_test (setup took ${since()})`);
const server = spawn("npx next start -p 3001", { stdio: "inherit", env, shell: true });
server.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGTERM", () => server.kill("SIGTERM"));
process.on("SIGINT", () => server.kill("SIGINT"));
