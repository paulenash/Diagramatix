/**
 * Vitest globalSetup — runs once before any test file is imported.
 *
 * Responsibilities:
 *   1. Pin DATABASE_URL to the TEST database so the production code's
 *      `app/lib/db.ts` singleton connects to the right place. We don't
 *      mock the client — production code imports it directly.
 *   2. Apply the current Prisma schema to the test DB via `db push`.
 *      Catches schema drift the moment it lands — if the schema is
 *      broken, every test fails fast with a clear error.
 *
 * Pre-requisite: a Postgres reachable at TEST_DATABASE_URL (or the
 * default below). Locally that's the same `postgres` service Paul
 * runs for dev; in CI it's a service container declared in the
 * workflow. The test database itself must exist (we create it
 * once-and-forever — `db push` doesn't `CREATE DATABASE`).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_TEST_URL =
  "postgres://postgres:postgres@localhost:5432/diagramatix_test";

export default async function setup() {
  // Resolve test DB URL — TEST_DATABASE_URL overrides the default so CI
  // can point at its own service container. Override DATABASE_URL so
  // any production code that reads it lands on the test DB.
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_URL;
  process.env.DATABASE_URL = url;

  // Apply schema — the equivalent of what azure-deploy.yml does for
  // prod every push (see that workflow for the rationale on each flag).
  //   • `--accept-data-loss` required even for additive changes — new
  //     unique constraints trip Prisma's caution flag.
  //   • `--url` passed explicitly rather than letting prisma.config.ts
  //     resolve it. Avoids dotenv/config-from-the-config-file shadowing
  //     our test override.
  //   • `--skip-generate` NOT used — Prisma 7 removed it from `db push`
  //     and trips an "unknown option" error.
  //
  // cwd is set to the diagramatix root so prisma.config.ts is found
  // regardless of where vitest was launched from.
  const diagramatixRoot = path.resolve(__dirname, "../..");
  const result = spawnSync(
    "npx",
    [
      "prisma",
      "db",
      "push",
      "--accept-data-loss",
      "--url",
      url,
    ],
    {
      cwd: diagramatixRoot,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
      shell: true,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `prisma db push against ${url} failed (exit ${result.status}).\n` +
        `--- stdout ---\n${result.stdout}\n` +
        `--- stderr ---\n${result.stderr}\n` +
        `Is the test database reachable? Locally: ` +
        `\`createdb diagramatix_test\` or run \`psql -c "CREATE DATABASE diagramatix_test"\`.`,
    );
  }
}
