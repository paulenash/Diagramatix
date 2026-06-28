/**
 * Project delete cascade (backlog #3) — the data effects of deleting a project,
 * across the three tiers. Tests the extracted lib (deleteProjectCascade) against
 * the real DB, so a regression in what happens to diagrams / history / versions /
 * shares / bundles on delete fails here.
 *
 * Modes:
 *   - unorganise (×)  — project gone; diagrams survive, SetNull to Unorganised;
 *                       a PUBLISHED child is demoted to DRAFT (pointer cleared);
 *                       shares cascade away. (DATA-16: no invisible published orphan.)
 *   - hard (×++)      — diagrams + their history + versions permanently deleted.
 *   - archive (×+)    — diagrams moved into the system archive, then project deleted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createUserWithOrg, addOrgMember, createProject, addProjectShare, createDiagram } from "../_setup/factories";
import { deleteProjectCascade } from "@/app/lib/projects/deleteProject";

async function seed() {
  // Archive mode parks diagrams in the system archive project, which is owned by
  // the first superuser — so one must exist (email in SUPERUSER_EMAILS).
  await createUserWithOrg({ email: "paul@nashcc.com.au" });
  const { user: owner, org } = await createUserWithOrg();
  const sharee = await createUser(); await addOrgMember(sharee.id, org.id, "Viewer");
  const project = await createProject({ userId: owner.id, orgId: org.id });
  await addProjectShare(project.id, sharee.id, "VIEW");

  const draft = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id });
  const pub = await createDiagram({ userId: owner.id, orgId: org.id, projectId: project.id });
  const pv = await prisma.publishedVersion.create({
    data: { diagramId: pub.id, versionNumber: 1, name: "Pub", type: "bpmn", data: {}, colorConfig: {}, displayMode: "normal", publishedById: owner.id },
  });
  await prisma.diagram.update({ where: { id: pub.id }, data: { lifecycle: "PUBLISHED", currentPublishedVersionId: pv.id } });
  await prisma.diagramHistory.create({ data: { diagramId: pub.id, snapshot: {}, userId: owner.id } });

  return { owner, org, sharee, project, draft, pub, pv };
}
type World = Awaited<ReturnType<typeof seed>>;

describe("project delete cascade", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });
  const actor = () => ({ id: w.owner.id, email: w.owner.email });

  it("unorganise — diagrams survive as Unorganised, published demoted, shares cascade away", async () => {
    const res = await deleteProjectCascade(w.project.id, w.org.id, "unorganise", actor(), w.project.name);
    expect(res).toMatchObject({ mode: "unorganise", unpublished: 1, archived: 0, purged: 0 });

    // Project gone; both diagrams survive with projectId = null (Unorganised).
    expect(await prisma.project.findUnique({ where: { id: w.project.id } })).toBeNull();
    const draft = await prisma.diagram.findUnique({ where: { id: w.draft.id } });
    const pub = await prisma.diagram.findUnique({ where: { id: w.pub.id } });
    expect(draft?.projectId).toBeNull();
    expect(pub?.projectId).toBeNull();

    // Published child demoted to DRAFT, currentPublishedVersionId cleared (DATA-16).
    expect(pub?.lifecycle).toBe("DRAFT");
    expect(pub?.currentPublishedVersionId).toBeNull();

    // History survives (the diagram survived); shares cascade-deleted with the project.
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.pub.id } })).toBe(1);
    expect(await prisma.projectShare.count({ where: { projectId: w.project.id } })).toBe(0);
  });

  it("hard — diagrams, history and versions are permanently purged", async () => {
    const res = await deleteProjectCascade(w.project.id, w.org.id, "hard", actor(), w.project.name);
    expect(res).toMatchObject({ mode: "hard", purged: 2 });

    expect(await prisma.project.findUnique({ where: { id: w.project.id } })).toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: w.draft.id } })).toBeNull();
    expect(await prisma.diagram.findUnique({ where: { id: w.pub.id } })).toBeNull();
    // History + version rows cascade-delete with their diagram.
    expect(await prisma.diagramHistory.count({ where: { diagramId: w.pub.id } })).toBe(0);
    expect(await prisma.publishedVersion.count({ where: { diagramId: w.pub.id } })).toBe(0);
    expect(await prisma.projectShare.count({ where: { projectId: w.project.id } })).toBe(0);
  });

  it("archive — diagrams are moved into the system archive, then the project is deleted", async () => {
    const res = await deleteProjectCascade(w.project.id, w.org.id, "archive", actor(), w.project.name);
    expect(res.mode).toBe("archive");
    expect(res.archived).toBe(2);

    // Original project gone; diagrams survive but no longer in it (moved to archive).
    expect(await prisma.project.findUnique({ where: { id: w.project.id } })).toBeNull();
    const draft = await prisma.diagram.findUnique({ where: { id: w.draft.id } });
    expect(draft).not.toBeNull();
    expect(draft?.projectId).not.toBe(w.project.id);
    expect(draft?.projectId).not.toBeNull(); // re-parented into the archive project
  });
});
