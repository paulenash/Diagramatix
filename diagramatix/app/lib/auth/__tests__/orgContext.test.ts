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

const {
  findUniqueProject,
  findFirstOrgMember,
  findUniqueDiagram,
  findUniqueUser,
  SUPER_EMAILS,
} = vi.hoisted(() => ({
  findUniqueProject: vi.fn(),
  findFirstOrgMember: vi.fn(),
  findUniqueDiagram: vi.fn(),
  findUniqueUser: vi.fn(),
  // Mirror the production allowlist exactly so the elevation tests can
  // pick specific emails (super@x and non-super@x). Hoisted alongside
  // the mock fns because vi.mock factories run before any top-level
  // const initialisers.
  SUPER_EMAILS: ["super@example.com", "other-super@example.com"],
}));

vi.mock("@/app/lib/db", () => ({
  prisma: {
    project: { findUnique: findUniqueProject },
    orgMember: { findFirst: findFirstOrgMember },
    diagram: { findUnique: findUniqueDiagram },
    user: { findUnique: findUniqueUser },
  },
}));

vi.mock("@/app/lib/superuser", () => ({
  // The helper just needs a way to map session → userId. We pass the userId
  // through directly via session.user.id so each test sets its own caller.
  getEffectiveUserId: (session: { user?: { id?: string } } | null) =>
    session?.user?.id ?? null,
  SUPERUSER_EMAILS: new Set(SUPER_EMAILS),
}));

// Imported after the mocks so the module under test picks them up.
import {
  getProjectAccess,
  requireProjectAccess,
  getDiagramAccess,
  requireDiagramAccess,
  OrgContextError,
} from "../orgContext";

const emptyCookies = { get: () => undefined };

beforeEach(() => {
  findUniqueProject.mockReset();
  findFirstOrgMember.mockReset();
  findUniqueDiagram.mockReset();
  findUniqueUser.mockReset();
  // Default: the elevation check finds no SuperAdmin email and no
  // OrgAdmin/OrgOwner row. Tests that exercise elevation override
  // these explicitly.
  findUniqueUser.mockResolvedValue({ email: "regular@example.com" });
});

/**
 * `findFirstOrgMember` is consulted by TWO different code paths inside
 * orgContext, so tests that care about one of them need to disambiguate:
 *
 *   • Elevation lookup — `where.role: { in: ["Admin","Owner"] }`. Used
 *     by `isAdminElevatedForOrg` to decide whether the caller silently
 *     gets implicit owner access.
 *   • Cross-org gate — bare `{ userId, orgId }`. Used when a share
 *     recipient may be in a different Org than the project.
 *
 * This helper produces a mock implementation that routes by inspecting
 * whether the `where.role` filter is set, so each test can describe both
 * outcomes independently.
 */
function mockOrgMember(opts: {
  elevation?: { id: string } | null;
  crossOrgGate?: { id: string } | null;
}) {
  type FindFirstArgs = { where?: { role?: unknown } } | undefined;
  findFirstOrgMember.mockImplementation(async (args: FindFirstArgs) => {
    if (args?.where?.role !== undefined) return opts.elevation ?? null;
    return opts.crossOrgGate ?? null;
  });
}

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
    // Caller is a plain Org member (cross-org gate passes) but NOT
    // OrgAdmin/OrgOwner, so the share role still wins.
    mockOrgMember({ elevation: null, crossOrgGate: { id: "mem-1" } });
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
    mockOrgMember({ elevation: null, crossOrgGate: { id: "mem-1" } });
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
    // When the gate is open, the implementation must skip the cross-org
    // OrgMember lookup. The elevation lookup (with the role filter) is
    // allowed to run as part of Slice 7c — that's a separate probe.
    const crossOrgGateCalls = findFirstOrgMember.mock.calls.filter(
      ([args]) => !(args && args.where && args.where.role !== undefined),
    );
    expect(crossOrgGateCalls).toHaveLength(0);
  });

  // ── Silent admin elevation (Slice 7c) ────────────────────────────────

  it("grants implicit owner to a SuperAdmin caller for ANY project, no share required", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [], // no share row
    });
    // Caller email is in the SuperAdmin allowlist.
    findUniqueUser.mockResolvedValue({ email: "super@example.com" });
    const access = await getProjectAccess("super-user-id", "proj-X");
    expect(access).toEqual({
      role: "owner",
      projectOrgId: "org-A",
      ownerUserId: "user-owner",
    });
  });

  it("grants implicit owner to an OrgAdmin in the project's Org", async () => {
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [],
    });
    mockOrgMember({ elevation: { id: "mem-admin" }, crossOrgGate: null });
    const access = await getProjectAccess("orgadmin-user", "proj-X");
    expect(access?.role).toBe("owner");
  });

  it("grants implicit owner to an OrgOwner in the project's Org", async () => {
    // The elevation probe filters by role: { in: ['Admin','Owner'] }, so
    // a match indicates *either* role. We don't disambiguate here on
    // purpose — the role-set is what counts.
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [],
    });
    mockOrgMember({ elevation: { id: "mem-owner" }, crossOrgGate: null });
    const access = await getProjectAccess("orgowner-user", "proj-X");
    expect(access?.role).toBe("owner");
  });

  it("does NOT grant implicit owner when the caller is OrgAdmin in a DIFFERENT Org", async () => {
    // The elevation lookup filters by (userId, projectOrgId, role IN
    // [...]). When the caller's OrgAdmin role is in some other Org, the
    // lookup returns null — exactly the same as having no role at all.
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [], // no share row either
    });
    mockOrgMember({ elevation: null, crossOrgGate: null });
    expect(await getProjectAccess("user-1", "proj-X")).toBeNull();
  });

  it("elevation overrides a lower share role (caller has VIEW share AND is OrgAdmin)", async () => {
    // The contract is "owner everywhere, silently". A view-share that
    // happens to overlap with an OrgAdmin membership must NOT cap the
    // resolved role at view.
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [{ role: "VIEW" }],
    });
    mockOrgMember({ elevation: { id: "mem-admin" }, crossOrgGate: null });
    const access = await getProjectAccess("orgadmin-user", "proj-X");
    expect(access?.role).toBe("owner");
  });

  it("does NOT consult the elevation probe when caller is the project owner", async () => {
    // Project-owner fast-path must not pay the cost of an elevation
    // lookup. Asserts both the role result AND that no OrgMember
    // queries fired.
    findUniqueProject.mockResolvedValue({
      userId: "user-1",
      orgId: "org-A",
      org: { allowCrossOrgSharing: false },
      shares: [],
    });
    const access = await getProjectAccess("user-1", "proj-X");
    expect(access?.role).toBe("owner");
    expect(findFirstOrgMember).not.toHaveBeenCalled();
    expect(findUniqueUser).not.toHaveBeenCalled();
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

// ── getDiagramAccess / requireDiagramAccess ───────────────────────────────
//
// The diagram helpers wrap project access plus the legacy orphan-diagram
// path (projectId === null). The wrapper is the only thing the diagram API
// routes touch, so these tests pin the two branches it has to deal with.

describe("getDiagramAccess", () => {
  it("returns null when the diagram does not exist", async () => {
    findUniqueDiagram.mockResolvedValue(null);
    expect(await getDiagramAccess("user-1", "missing")).toBeNull();
  });

  it("returns owner role for a legacy orphan diagram owned by the caller", async () => {
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-1",
      orgId: "org-A",
      projectId: null,
      diagramOwnerId: null,
    });
    const access = await getDiagramAccess("user-1", "diag-1");
    expect(access?.role).toBe("owner");
    expect(access?.projectAccess).toBeNull();
    // Orphan path must NOT call getProjectAccess (no project to query).
    expect(findUniqueProject).not.toHaveBeenCalled();
  });

  it("returns null for a legacy orphan diagram not owned by the caller", async () => {
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-other",
      orgId: "org-A",
      projectId: null,
      diagramOwnerId: null,
    });
    // No elevation either — caller is a plain user, not in any admin
    // path for diag's Org.
    mockOrgMember({ elevation: null, crossOrgGate: null });
    expect(await getDiagramAccess("user-1", "diag-1")).toBeNull();
  });

  it("grants implicit owner to SuperAdmin on an orphan diagram", async () => {
    // SuperAdmin can reach legacy pre-Slice-1 orphans for support.
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-other",
      orgId: "org-A",
      projectId: null,
      diagramOwnerId: null,
    });
    findUniqueUser.mockResolvedValue({ email: "super@example.com" });
    const access = await getDiagramAccess("super-user-id", "diag-1");
    expect(access?.role).toBe("owner");
    expect(access?.projectAccess).toBeNull();
  });

  it("grants implicit owner to OrgAdmin on an orphan diagram in their Org", async () => {
    // Orphan elevation scopes by the diagram's orgId — same rule as
    // project elevation scopes by project.orgId.
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-other",
      orgId: "org-A",
      projectId: null,
      diagramOwnerId: null,
    });
    mockOrgMember({ elevation: { id: "mem-admin" }, crossOrgGate: null });
    const access = await getDiagramAccess("orgadmin-user", "diag-1");
    expect(access?.role).toBe("owner");
  });

  it("delegates to getProjectAccess when the diagram has a project (edit share)", async () => {
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-owner",
      orgId: "org-A",
      projectId: "proj-X",
      diagramOwnerId: "user-owner",
    });
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "EDIT" }],
    });
    const access = await getDiagramAccess("user-1", "diag-1");
    expect(access?.role).toBe("edit");
    expect(access?.projectAccess?.role).toBe("edit");
    expect(access?.projectAccess?.ownerUserId).toBe("user-owner");
  });

  it("returns null when the diagram is in a project the caller has no access to", async () => {
    findUniqueDiagram.mockResolvedValue({
      id: "diag-1",
      userId: "user-owner",
      orgId: "org-A",
      projectId: "proj-X",
      diagramOwnerId: "user-owner",
    });
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [], // no share row for user-1
    });
    expect(await getDiagramAccess("user-1", "diag-1")).toBeNull();
  });
});

describe("requireDiagramAccess", () => {
  const sessionFor = (id: string | null) =>
    (id ? { user: { id } } : null) as Parameters<typeof requireDiagramAccess>[0];

  it("throws 401 when there is no session", async () => {
    await expect(
      requireDiagramAccess(sessionFor(null), emptyCookies, "diag-1", "view"),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws 404 when the diagram does not exist", async () => {
    findUniqueDiagram.mockResolvedValue(null);
    await expect(
      requireDiagramAccess(sessionFor("user-1"), emptyCookies, "diag-1", "view"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when the diagram exists but the caller has no access", async () => {
    // First findUnique (existence probe) returns truthy; second
    // (getDiagramAccess) sees an orphan owned by someone else.
    findUniqueDiagram
      .mockResolvedValueOnce({ id: "diag-1" })
      .mockResolvedValueOnce({
        id: "diag-1",
        userId: "user-other",
        orgId: "org-A",
        projectId: null,
        diagramOwnerId: null,
      });
    await expect(
      requireDiagramAccess(sessionFor("user-1"), emptyCookies, "diag-1", "view"),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("throws 403 when the caller has view but the route requires edit", async () => {
    findUniqueDiagram
      .mockResolvedValueOnce({ id: "diag-1" })
      .mockResolvedValueOnce({
        id: "diag-1",
        userId: "user-owner",
        orgId: "org-A",
        projectId: "proj-X",
        diagramOwnerId: "user-owner",
      });
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "VIEW" }],
    });
    await expect(
      requireDiagramAccess(sessionFor("user-1"), emptyCookies, "diag-1", "edit"),
    ).rejects.toBeInstanceOf(OrgContextError);
  });

  it("returns the diagram + project access record when minRole is met", async () => {
    findUniqueDiagram
      .mockResolvedValueOnce({ id: "diag-1" })
      .mockResolvedValueOnce({
        id: "diag-1",
        userId: "user-owner",
        orgId: "org-A",
        projectId: "proj-X",
        diagramOwnerId: "user-owner",
      });
    findUniqueProject.mockResolvedValue({
      userId: "user-owner",
      orgId: "org-A",
      org: { allowCrossOrgSharing: true },
      shares: [{ role: "EDIT" }],
    });
    const access = await requireDiagramAccess(
      sessionFor("user-1"),
      emptyCookies,
      "diag-1",
      "edit",
    );
    expect(access.role).toBe("edit");
    expect(access.diagram.projectId).toBe("proj-X");
    expect(access.projectAccess?.ownerUserId).toBe("user-owner");
  });
});
