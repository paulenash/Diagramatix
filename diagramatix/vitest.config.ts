import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Diagramatix regression-test suite.
 *
 * Tests live under `tests/` at the project root, organised by concern
 * (auth, projects, sharing, diagrams, elevation, orgSettings). Every
 * test exercises a real Next.js route handler against a real PostgreSQL
 * test database — no mocks of Prisma, no mocks of `auth()`. The point
 * is to catch production failure modes (broken access guards, schema
 * drift, mistyped queries) before they reach Azure.
 *
 * The previous mock-heavy unit suite was deleted on 2026-06-06; see the
 * commit message + project_test_suite_review memory for the reasoning.
 *
 * Tests run serially (`fileParallelism: false`) because they share the
 * test database and seed-then-truncate is the cheapest path to
 * isolation. Per-file setup/teardown handles cleanup.
 *
 * Locally, the suite needs a Postgres at `TEST_DATABASE_URL` (defaults
 * to `postgres://postgres:postgres@localhost:5432/diagramatix_test`).
 * In CI, `.github/workflows/ci.yml` spins up a Postgres service.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Real DB; one test mutating shared rows would race a parallel run.
    fileParallelism: false,
    // Allow `vitest run` to exit 0 when no tests exist yet — keeps the
    // pipeline green during the brief gap between deleting the old
    // suite and adding the new one.
    passWithNoTests: true,
    // Per-suite DB bootstrap (db push + truncate) can take a few seconds
    // — give each file 60s default before vitest's per-test 5s timeout
    // intrudes on legitimately slow flows like the share-roundtrip case.
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
});
