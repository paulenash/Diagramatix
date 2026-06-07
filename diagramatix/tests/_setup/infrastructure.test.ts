/**
 * Smoke test for the test infrastructure itself.
 *
 * Verifies that:
 *   • globalSetup pointed DATABASE_URL at the test DB and applied the
 *     current Prisma schema (otherwise the queries below would fail
 *     with "relation does not exist").
 *   • truncateAll() actually clears tables.
 *   • The factories produce rows the Prisma client can read back.
 *
 * If this test fails, every other test will fail in confusing ways —
 * fix this first.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "./db";
import { createUser, createUserWithOrg } from "./factories";

describe("test infrastructure", () => {
  beforeEach(async () => {
    await truncateAll();
  });

  it("connects to the test database (DATABASE_URL was overridden)", () => {
    expect(process.env.DATABASE_URL).toMatch(/diagramatix_test/);
  });

  it("can create and read back a user via the real Prisma client", async () => {
    const created = await createUser({ email: "smoke@diagramatix.test" });
    const found = await prisma.user.findUnique({ where: { id: created.id } });
    expect(found?.email).toBe("smoke@diagramatix.test");
  });

  it("creates a user-with-Org bundle with an Owner-role membership", async () => {
    const { user, org } = await createUserWithOrg();
    const membership = await prisma.orgMember.findFirst({
      where: { userId: user.id, orgId: org.id },
      select: { role: true },
    });
    expect(membership?.role).toBe("Owner");
  });

  it("truncateAll wipes every row between tests", async () => {
    // The beforeEach already ran. Confirm we start with zero users.
    const usersBefore = await prisma.user.count();
    expect(usersBefore).toBe(0);

    await createUser();
    expect(await prisma.user.count()).toBe(1);

    await truncateAll();
    expect(await prisma.user.count()).toBe(0);
  });
});
