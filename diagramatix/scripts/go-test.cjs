/**
 * `npm run go-test` — build + start the production server against the TEST
 * database (diagramatix_test) on port 3001, mirroring `npm run go` (which uses
 * the real DB on :3000). Implemented as a Node wrapper so the env overrides work
 * from any shell (bash / cmd / PowerShell) — npm picks the script shell, but Node
 * sets process.env itself and invokes Next's CLI directly, so shell syntax
 * differences don't matter.
 */
const { spawnSync } = require("child_process");

const env = {
  ...process.env,
  DATABASE_URL: "postgres://postgres:postgres@localhost:5432/diagramatix_test",
  PORT: "3001",
};

const nextBin = require.resolve("next/dist/bin/next");

function run(args) {
  const r = spawnSync(process.execPath, [nextBin, ...args], { stdio: "inherit", env });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("[go-test] Building + starting on http://localhost:3001 against diagramatix_test\n");
run(["build"]);
run(["start", "-p", "3001"]);
