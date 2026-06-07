/**
 * Test-side Prisma access.
 *
 * Tests should always import `prisma` from `@/app/lib/db` (the same
 * client the production code uses) — that's what makes these
 * integration tests "real". This file just exposes a `truncateAll()`
 * helper so each test starts from a clean slate without having to
 * enumerate every table.
 *
 * Truncation order doesn't matter because we use `CASCADE`. We
 * deliberately skip Prisma's own `_prisma_migrations` (if present) so
 * the schema state survives across tests.
 */

import { prisma } from "@/app/lib/db";

interface TableRow {
  tablename: string;
}

/**
 * TRUNCATE every user-facing table in the test database, leaving the
 * schema intact. Use in `beforeEach` so each test starts empty.
 *
 * Implementation: enumerate the public schema's tables and TRUNCATE
 * them in one statement with CASCADE + RESTART IDENTITY. This is
 * `O(tables)` per test but typical test fixtures are <50 rows so the
 * cost is negligible.
 */
export async function truncateAll(): Promise<void> {
  const tables = await prisma.$queryRaw<TableRow[]>`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE '_prisma_%'
  `;
  if (tables.length === 0) return;

  const list = tables
    .map((t) => `"${t.tablename.replace(/"/g, '""')}"`)
    .join(", ");
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`,
  );
}
