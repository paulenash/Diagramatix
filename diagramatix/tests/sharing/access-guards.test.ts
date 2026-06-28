/**
 * Project + Diagram access guards — the sharing permission matrix (#1) and
 * cross-user isolation (#2).
 *
 * Exercises the real authorization resolvers (requireProjectAccess /
 * requireDiagramAccess in app/lib/auth/orgContext.ts) against the real test DB —
 * no mocks. These are the single chokepoint every project/diagram route calls,
 * so pinning them nets a whole class of "missing access guard" regressions
 * (unauthorized read/edit, a View collaborator escalating to Edit, a cross-org
 * share leaking access, a legacy orphan diagram reachable by the wrong user).
 *
 * Roles: owner > edit > view. Resolution = ownership → admin elevation →
 * ProjectShare row (gated by org membership unless the org allows cross-org
 * sharing). A signed-in session is faked as a plain object (no auth() mock); the
 * resolver reads the user id from it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember, createProject, addProjectShare, createDiagram } from "../_setup/factories";
import { requireProjectAccess, requireDiagramAccess } from "@/app/lib/auth/orgContext";

// No impersonation cookie → effective user = session user.
const cookies = { get: () => undefined };
const sessionFor = (u: { id: string; email: string }) => ({ user: { id: u.id, email: u.email } });
const FAKE_ID = "cnonexistent000000000000";

/** Assert the call is denied with a specific HTTP status (OrgContextError.status). */
async function expectDenied(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toMatchObject({ status });
}

async function seedWorld() {
  // Owner of a project in org `org` (created Owner of their own org).
  const { user: owner, org } = await createUserWithOrg();
  // Plain org members (Viewer role → never admin-elevated) with shares.
  const editor = await createUser(); await addOrgMember(editor.id, org.id, "Viewer");
  const viewer = await createUser(); await addOrgMember(viewer.id, org.id, "Viewer");
  // No org membership, no share.
  const outsider = await createUser();

  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, editor.id, "EDIT");
  await addProjectShare(project.id, viewer.id, "VIEW");

  const diagram = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id });
  const orphan = await createDiagram({ userId: owner.id, orgId: org.id, projectId: null }); // legacy orphan

  return { owner, org, editor, viewer, outsider, project, diagram, orphan };
}
type World = Awaited<ReturnType<typeof seedWorld>>;

describe("project + diagram access guards", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seedWorld(); });

  describe("requireProjectAccess — permission matrix", () => {
    it("owner has full access (view + edit)", async () => {
      expect((await requireProjectAccess(sessionFor(w.owner), cookies, w.project.id, "view")).role).toBe("owner");
      expect((await requireProjectAccess(sessionFor(w.owner), cookies, w.project.id, "edit")).role).toBe("owner");
    });
    it("EDIT sharee can view and edit", async () => {
      expect((await requireProjectAccess(sessionFor(w.editor), cookies, w.project.id, "view")).role).toBe("edit");
      expect((await requireProjectAccess(sessionFor(w.editor), cookies, w.project.id, "edit")).role).toBe("edit");
    });
    it("VIEW sharee can view but NOT edit (403)", async () => {
      expect((await requireProjectAccess(sessionFor(w.viewer), cookies, w.project.id, "view")).role).toBe("view");
      await expectDenied(requireProjectAccess(sessionFor(w.viewer), cookies, w.project.id, "edit"), 403);
    });
    it("outsider is denied at any role (403)", async () => {
      await expectDenied(requireProjectAccess(sessionFor(w.outsider), cookies, w.project.id, "view"), 403);
      await expectDenied(requireProjectAccess(sessionFor(w.outsider), cookies, w.project.id, "edit"), 403);
    });
    it("not signed in → 401", async () => {
      await expectDenied(requireProjectAccess(null, cookies, w.project.id, "view"), 401);
    });
    it("nonexistent project → 403 (existence not leaked to non-members)", async () => {
      await expectDenied(requireProjectAccess(sessionFor(w.owner), cookies, FAKE_ID, "view"), 403);
    });
  });

  describe("requireDiagramAccess — in-project diagram inherits project access", () => {
    it("owner + EDIT edit; VIEW is view-only; outsider denied", async () => {
      expect((await requireDiagramAccess(sessionFor(w.owner), cookies, w.diagram.id, "edit")).role).toBe("owner");
      expect((await requireDiagramAccess(sessionFor(w.editor), cookies, w.diagram.id, "edit")).role).toBe("edit");
      expect((await requireDiagramAccess(sessionFor(w.viewer), cookies, w.diagram.id, "view")).role).toBe("view");
      await expectDenied(requireDiagramAccess(sessionFor(w.viewer), cookies, w.diagram.id, "edit"), 403);
      await expectDenied(requireDiagramAccess(sessionFor(w.outsider), cookies, w.diagram.id, "view"), 403);
    });
    it("nonexistent diagram → 404", async () => {
      await expectDenied(requireDiagramAccess(sessionFor(w.owner), cookies, FAKE_ID, "view"), 404);
    });
    it("not signed in → 401", async () => {
      await expectDenied(requireDiagramAccess(null, cookies, w.diagram.id, "view"), 401);
    });
  });

  describe("cross-user isolation", () => {
    it("a legacy orphan diagram is reachable only by its owner — even an org-member project-sharee is denied", async () => {
      expect((await requireDiagramAccess(sessionFor(w.owner), cookies, w.orphan.id, "edit")).role).toBe("owner");
      // editor is an org member AND a sharee of the project, but the orphan has
      // no project, so neither helps — only the original owner gets in.
      await expectDenied(requireDiagramAccess(sessionFor(w.editor), cookies, w.orphan.id, "view"), 403);
      await expectDenied(requireDiagramAccess(sessionFor(w.outsider), cookies, w.orphan.id, "view"), 403);
    });

    it("a user in a DIFFERENT org with no share cannot reach the project or its diagram", async () => {
      const { user: stranger } = await createUserWithOrg(); // their own org
      await expectDenied(requireProjectAccess(sessionFor(stranger), cookies, w.project.id, "view"), 403);
      await expectDenied(requireDiagramAccess(sessionFor(stranger), cookies, w.diagram.id, "view"), 403);
    });

    it("a VIEW share never escalates to edit (downgrade enforced on project AND diagram)", async () => {
      await expectDenied(requireProjectAccess(sessionFor(w.viewer), cookies, w.project.id, "edit"), 403);
      await expectDenied(requireDiagramAccess(sessionFor(w.viewer), cookies, w.diagram.id, "edit"), 403);
    });

    it("a cross-org share is INERT without allowCrossOrgSharing — a sharee outside the project's org is still denied", async () => {
      // stranger has their own org, is granted an EDIT share, but is NOT a member
      // of the project's org and the org doesn't allow cross-org sharing.
      const { user: stranger } = await createUserWithOrg();
      await addProjectShare(w.project.id, stranger.id, "EDIT");
      await expectDenied(requireProjectAccess(sessionFor(stranger), cookies, w.project.id, "view"), 403);
    });
  });
});
