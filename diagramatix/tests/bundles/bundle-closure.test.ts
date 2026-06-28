/**
 * Bundle closure + business-user access (#5).
 *
 * Two real libs, no mocks:
 *   • `walkForwardClosure` — from a root diagram, follow element
 *     `properties.linkedDiagramId` (subprocess / submachine / etc.) to pull in
 *     the in-project linked-diagram closure. Bundles are project-scoped, so a
 *     link that hops OUT of the project is recorded but NOT enqueued, and
 *     unrelated diagrams never appear.
 *   • `getDiagramAccess` business-user path — an audience member of an active
 *     PublicationBundle gets `role: "business-user"` to a diagram IN the bundle,
 *     but not to one outside it; a non-audience user is denied; once the bundle
 *     is superseded the grant evaporates.
 *
 * The bundle membership + audience rows are seeded directly (the route's
 * transaction is a thin wrapper around these same `create`s); the closure walk
 * here is exactly what the route uses to decide membership.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember, createProject, createDiagram } from "../_setup/factories";
import { walkForwardClosure } from "@/app/lib/diagram/linkClosure";
import { getDiagramAccess } from "@/app/lib/auth/orgContext";

/** Set a diagram's data to link forward to `targetId` via a subprocess element. */
async function linkTo(diagramId: string, targetId: string, elementId = "el1") {
  await prisma.diagram.update({
    where: { id: diagramId },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { elements: [{ id: elementId, type: "subprocess", properties: { linkedDiagramId: targetId } }] } as any,
    },
  });
}

/**
 * World: a project with a link chain root → child → grandchild, an UNRELATED
 * diagram in the same project, and a diagram in a DIFFERENT project (a
 * cross-project hop target).
 */
async function seed() {
  const { user: owner, org } = await createUserWithOrg();
  const project = await createProject({ userId: owner.id, orgId: org.id });

  const root = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Root" });
  const child = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Child" });
  const grandchild = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Grandchild" });
  const unrelated = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id, name: "Unrelated" });

  // A separate project + a diagram in it, linked from root (cross-project hop).
  const otherProject = await createProject({ userId: owner.id, orgId: org.id, name: "Other" });
  const external = await createDiagram({ userId: owner.id, orgId: org.id, projectId: otherProject.id, name: "External" });

  // root → child → grandchild (in-project chain); root also → external (out).
  await prisma.diagram.update({
    where: { id: root.id },
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { elements: [
        { id: "a", type: "subprocess", properties: { linkedDiagramId: child.id } },
        { id: "b", type: "subprocess", properties: { linkedDiagramId: external.id } },
      ] } as any,
    },
  });
  await linkTo(child.id, grandchild.id);

  return { owner, org, project, root, child, grandchild, unrelated, otherProject, external };
}
type World = Awaited<ReturnType<typeof seed>>;

/** Seed a bundle over the given diagram ids with the given audience users. */
async function makeBundle(opts: {
  projectId: string; publishedById: string; diagramIds: string[]; rootId: string;
  audienceUserIds?: string[]; supersededAt?: Date | null;
}) {
  const bundle = await prisma.publicationBundle.create({
    data: { name: "Release", projectId: opts.projectId, publishedById: opts.publishedById, supersededAt: opts.supersededAt ?? null },
  });
  await prisma.publicationBundleDiagram.createMany({
    data: opts.diagramIds.map(id => ({ bundleId: bundle.id, diagramId: id, isRoot: id === opts.rootId })),
  });
  if (opts.audienceUserIds?.length) {
    await prisma.publicationBundleAudience.createMany({
      data: opts.audienceUserIds.map(userId => ({ bundleId: bundle.id, userId, addedById: opts.publishedById })),
    });
  }
  return bundle;
}

describe("bundle closure", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  it("closure from a root is exactly root + in-project linked descendants — no unrelated, no cross-project", async () => {
    const res = await walkForwardClosure(w.root.id, w.project.id, prisma);
    const ids = new Set(res.diagramIds);

    expect(ids).toEqual(new Set([w.root.id, w.child.id, w.grandchild.id]));
    expect(ids.has(w.unrelated.id)).toBe(false); // unrelated in-project diagram excluded
    expect(ids.has(w.external.id)).toBe(false);   // cross-project hop NOT enqueued

    // The cross-project link is recorded (for the publish dialog warning) but
    // doesn't pull the external diagram into the bundle.
    expect(res.crossProjectLinks).toHaveLength(1);
    expect(res.crossProjectLinks[0].targetDiagramId).toBe(w.external.id);
    expect(res.crossProjectLinks[0].targetProjectId).toBe(w.otherProject.id);
  });

  it("a leaf root with no links closes to just itself", async () => {
    const res = await walkForwardClosure(w.grandchild.id, w.project.id, prisma);
    expect(res.diagramIds).toEqual([w.grandchild.id]);
    expect(res.crossProjectLinks).toHaveLength(0);
  });
});

describe("bundle business-user access", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  it("an audience member gets business-user access to a bundle diagram but NOT to one outside the bundle", async () => {
    const biz = await createUser(); await addOrgMember(biz.id, w.org.id, "Viewer");
    // Bundle covers the root closure (root + child + grandchild) — NOT `unrelated`.
    await makeBundle({
      projectId: w.project.id, publishedById: w.owner.id, rootId: w.root.id,
      diagramIds: [w.root.id, w.child.id, w.grandchild.id], audienceUserIds: [biz.id],
    });

    // In-bundle diagram → business-user grant resolved via the audience row.
    const inBundle = await getDiagramAccess(biz.id, w.child.id);
    expect(inBundle?.role).toBe("business-user");
    expect(inBundle?.bundleId).toBeTruthy();

    // Diagram in the same project but NOT in the bundle → denied (null). The
    // business user is not a project sharee, so the project path fails too.
    const outOfBundle = await getDiagramAccess(biz.id, w.unrelated.id);
    expect(outOfBundle).toBeNull();
  });

  it("a non-audience user is denied even though the bundle exists", async () => {
    const stranger = await createUser(); await addOrgMember(stranger.id, w.org.id, "Viewer");
    await makeBundle({
      projectId: w.project.id, publishedById: w.owner.id, rootId: w.root.id,
      diagramIds: [w.root.id, w.child.id], audienceUserIds: [], // no audience
    });
    expect(await getDiagramAccess(stranger.id, w.root.id)).toBeNull();
  });

  it("a superseded bundle no longer grants access", async () => {
    const biz = await createUser(); await addOrgMember(biz.id, w.org.id, "Viewer");
    await makeBundle({
      projectId: w.project.id, publishedById: w.owner.id, rootId: w.root.id,
      diagramIds: [w.root.id, w.child.id], audienceUserIds: [biz.id],
      supersededAt: new Date(), // archived → grants revoked
    });
    expect(await getDiagramAccess(biz.id, w.root.id)).toBeNull();
  });

  it("the project owner still reaches a bundle diagram via the project path (role owner, not business-user)", async () => {
    const biz = await createUser(); await addOrgMember(biz.id, w.org.id, "Viewer");
    await makeBundle({
      projectId: w.project.id, publishedById: w.owner.id, rootId: w.root.id,
      diagramIds: [w.root.id, w.child.id], audienceUserIds: [biz.id],
    });
    const ownerAccess = await getDiagramAccess(w.owner.id, w.child.id);
    expect(ownerAccess?.role).toBe("owner");
  });
});
