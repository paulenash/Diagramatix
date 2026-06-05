/**
 * Unit tests for the project-access helpers added in the Project Sharing
 * feature. The whole point of these helpers is to consolidate a previously
 * scattered ownership check ("project.userId === session.user.id") into a
 * single function that handles owner / edit / view / no-access plus the
 * cross-org gate. So the tests fix that decision matrix in place — if a
 * future refactor inverts a branch, vitest catches it before a route does.
 *
 * Prisma is mocked. We're testing the access-resolution logic, not the
 * database, and the layout/diagram suites have already established the
 * "no DB in unit tests" convention for this repo.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────
// Replace the prisma client and the superuser/effective-user resolver with
// stubs we drive from each test. vi.mock is hoisted to module top by vitest,
// so any variables it references must be declared via vi.hoisted — otherwise
// the factory runs before the const initialisers and throws.

const { findUniqueProject, findFirstOrgMember } = vi.hoisted(() => ({
  findUniqueProject: vi.fn(),
  findFirstOrgMember: vi.fn(),
}));

vi.mock("@/app/lib/db", () => ({
  prisma: {
    project: { findUnique: findUniqueProject },
    orgMember: { findFirst: findFirstOrgMember },
  },
}));

vi.mock("@/app/lib/superuser", () => ({
  // The helper just needs a way to map session → userId. We pass the userId
  // through directly via session.user.id so each test sets its own caller.
  getEffectiveUserId: (session: { user?: { id?: string } } | null) =>
    session?.user?.id ?? null,
}));

// Imported after the mocks so the module under test picks them up.
import {
  getProjectAccess,
  requireProjectAccess,
  OrgContextError,
} from "../orgContext";

const emptyCookies = { get: () => undefined };

beforeEach(() => {
  findUniqueProject.mockReset();
  findFirstOrgMember.mockReset();
});

// ── getProjectAccess ──────────────────────────────────────────────────────

describe("getProjectAccess", () => {
  it("returns null when the project does not exist", async () => {
    findUniqueProject.mockResolvedValue(null);
    expect(await getProjectAccess("user-1", "missing")).toBeNull();
  });

  it("returns owner role when caller is project.userId", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-1",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [],
    });
    const access = await getProjectAccess("user-1", "proj-X");
    expect(access).toEqual({
      role: "owner",
      projectOrgId: "org-A",
      ownerUserId: "user-1",
    });
    // Owner path must NOT consult OrgMember — the project's own Org is
    // implicitly the owner's.
    expect(findFirstOrgMember).not.toHaveBeenCalled();
  });

  it("returns null when caller is not owner and has no share row", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [],
    });
    expect(await getProjectAccess("user-1", "proj-X")).toBeNull();
  });

  it("returns view role for a VIEW share when caller is in project's Org", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [{ role: "VIEW" }],
    });
    findFirstOrgMember.mockResolvedValue({ id: "mem-1" });
    const access = await getProjectAccess("user-1", "proj-X");
    expect(access).toEqual({
      role: "view",
      projectOrgId: "org-A",
      ownerUserId: "user-owner",
    });
  });

  it("returns edit role for an EDIT share when caller is in project's Org", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [{ role: "EDIT" }],
    });
    findFirstOrgMember.mockResolvedValue({ id: "mem-1" });
    const access = await getProjectAccess("user-1", "proj-X");
    expect(access?.role).toBe("edit");
  });

  // Cross-org gate — the only piece of logic that's both new and easy to
  // get wrong. Both branches verified explicitly.

  it("blocks a cross-org share when the project's Org has allowCrossOrgSharing = false", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [{ role: "EDIT" }],
    });
    // No OrgMember row for (user-1, org-A) → caller is in a different Org.
    findFirstOrgMember.mockResolvedValue(null);
    expect(await getProjectAccess("user-1", "proj-X")).toBeNull();
  });

  it("allows a cross-org share when the project's Org has allowCrossOrgSharing = true", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "EDIT" }],
    });
    const access = await getProjectAccess("user-1", "proj-X");
    expect(access?.role).toBe("edit");
    // When the gate is open, the implementation must skip the OrgMember
    // lookup — that's the whole point of the flag.
    expect(findFirstOrgMember).not.toHaveBeenCalled();
  });
});

// ── requireProjectAccess ──────────────────────────────────────────────────

describe("requireProjectAccess", () => {
  const sessionFor = (id: string | null) =>
    (id ? { user: { id } } : null) as Parameters<typeof requireProjectAccess>[0];

  it("throws 401 when there is no session userId", async () => {
    await expect(
      requireProjectAccess(sessionFor(null), emptyCookies, "proj-X", "view"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws 403 when the caller has no access (project missing or no share)", async () => {
    findUniqueProject.mockResolvedValue(null);
    await expect(
      requireProjectAccess(sessionFor("user-1"), emptyCookies, "proj-X", "view"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when caller has view but route requires edit", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "VIEW" }],
    });
    await expect(
      requireProjectAccess(sessionFor("user-1"), emptyCookies, "proj-X", "edit"),
    ).rejects.toBeInstanceOf(OrgContextError);
  });

  it("throws 403 when caller has edit but route requires owner", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "EDIT" }],
    });
    await expect(
      requireProjectAccess(sessionFor("user-1"), emptyCookies, "proj-X", "owner"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("returns the access record when the caller meets the minimum role", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "EDIT" }],
    });
    const access = await requireProjectAccess(
      sessionFor("user-1"),
      emptyCookies,
      "proj-X",
      "view",
    );
    expect(access.role).toBe("edit");
    expect(access.ownerUserId).toBe("user-owner");
  });

  it("returns owner access for the project owner regardless of minRole", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-1",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [],
    });
    const access = await requireProjectAccess(
      sessionFor("user-1"),
      emptyCookies,
      "proj-X",
      "owner",
    );
    expect(access.role).toBe("owner");
  });
});
