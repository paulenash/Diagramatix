/**
 * Entity Lists own-copy invariant (#6).
 *
 * The whole reason a project ADOPTS an org-master OrgStructure list is that it
 * gets its OWN independent copy to edit — naming a project's pools/lanes uses
 * the project's copy, NOT the org master (a known gotcha: see project memory
 * "Entity Lists"). This pins both directions of the isolation:
 *
 *   • editing the PROJECT copy (rename / add / delete a node) must NOT mutate
 *     the org master list or its nodes;
 *   • editing the org MASTER after adoption must NOT retroactively change the
 *     already-adopted project copy.
 *
 * Exercises the extracted `adoptStructure` lib (the route's data-effect) and the
 * real node-CRUD lib (`createNode`/`updateNode`/`deleteNode`) against the test
 * DB — no mocks. `replace` mode is covered too (one list per kind per project).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg, createProject } from "../_setup/factories";
import { adoptStructure, AdoptStructureError } from "@/app/lib/entityLists/adoptStructure";
import { createNode, updateNode, deleteNode } from "@/app/lib/entityLists/nodeOps";

/**
 * Seed an org master OrgStructure list with a small tree:
 *   Company (Organisation)
 *     └─ Finance (Team)
 *          └─ Analyst (Role)
 */
async function seed() {
  const { user, org } = await createUserWithOrg();
  const project = await createProject({ userId: user.id, orgId: org.id });

  const master = await prisma.entityList.create({
    data: { name: "Acme Org", kind: "OrgStructure", orgId: org.id },
  });
  const company = await prisma.entityNode.create({
    data: { listId: master.id, name: "Company", level: "Organisation", sortOrder: 0 },
  });
  const finance = await prisma.entityNode.create({
    data: { listId: master.id, parentId: company.id, name: "Finance", level: "Team", sortOrder: 0 },
  });
  await prisma.entityNode.create({
    data: { listId: master.id, parentId: finance.id, name: "Analyst", level: "Role", sortOrder: 0 },
  });

  return { user, org, project, master, company, finance };
}
type World = Awaited<ReturnType<typeof seed>>;

const masterNodeCount = (w: World) => prisma.entityNode.count({ where: { listId: w.master.id } });
const masterNames = async (w: World) =>
  (await prisma.entityNode.findMany({ where: { listId: w.master.id }, select: { name: true } }))
    .map(n => n.name).sort();

describe("entity lists — project own-copy invariant", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  it("adopt clones the master into a SEPARATE project-scoped list + node tree", async () => {
    const res = await adoptStructure(w.project.id, w.org.id, w.master.id);
    expect(res.nodeCount).toBe(3);

    const copy = await prisma.entityList.findUnique({ where: { id: res.listId } });
    expect(copy?.projectId).toBe(w.project.id);
    expect(copy?.orgId).toBeNull();
    expect(copy?.sourceListId).toBe(w.master.id); // provenance only
    expect(copy?.id).not.toBe(w.master.id);

    // Copy carries its own 3 nodes — distinct rows from the master's.
    const copyNodes = await prisma.entityNode.findMany({ where: { listId: res.listId } });
    expect(copyNodes).toHaveLength(3);
    const masterIds = new Set([w.company.id, w.finance.id]);
    for (const n of copyNodes) expect(masterIds.has(n.id)).toBe(false);

    // The cloned tree preserves structure: Finance still parents Analyst.
    const copyFinance = copyNodes.find(n => n.name === "Finance")!;
    const copyAnalyst = copyNodes.find(n => n.name === "Analyst")!;
    expect(copyAnalyst.parentId).toBe(copyFinance.id);
  });

  it("renaming / adding / deleting on the PROJECT copy leaves the org master untouched", async () => {
    const { listId } = await adoptStructure(w.project.id, w.org.id, w.master.id);
    const copyNodes = await prisma.entityNode.findMany({ where: { listId } });
    const copyFinance = copyNodes.find(n => n.name === "Finance")!;
    const copyAnalyst = copyNodes.find(n => n.name === "Analyst")!;

    // Rename on the copy.
    await updateNode(listId, copyFinance.id, { name: "Treasury" });
    // Add on the copy.
    await createNode(listId, { name: "New Team", level: "Team", parentId: null });
    // Delete on the copy (cascades to no children — Analyst is under Finance).
    await deleteNode(listId, copyAnalyst.id);

    // Project copy reflects all three edits: 3 - 1 (deleted) + 1 (added) = 3.
    const copyAfter = await prisma.entityNode.findMany({ where: { listId }, select: { name: true } });
    expect(copyAfter.map(n => n.name).sort()).toEqual(["Company", "New Team", "Treasury"]);

    // Org master is completely unchanged — same count, same names.
    expect(await masterNodeCount(w)).toBe(3);
    expect(await masterNames(w)).toEqual(["Analyst", "Company", "Finance"]);
    // The master list row itself still exists and is org-scoped.
    const master = await prisma.entityList.findUnique({ where: { id: w.master.id } });
    expect(master?.orgId).toBe(w.org.id);
    expect(master?.name).toBe("Acme Org");
  });

  it("editing the org MASTER after adoption does NOT change the already-adopted project copy", async () => {
    const { listId } = await adoptStructure(w.project.id, w.org.id, w.master.id);

    // Mutate the master directly (as the org-master CRUD would).
    await updateNode(w.master.id, w.company.id, { name: "Globex" });
    await createNode(w.master.id, { name: "Legal", level: "Team", parentId: w.company.id });
    await deleteNode(w.master.id, w.finance.id); // cascades Analyst away

    // Master now: Globex + Legal = 2 nodes.
    expect((await masterNames(w))).toEqual(["Globex", "Legal"]);

    // Project copy is frozen at adoption time: still Company / Finance / Analyst.
    const copyAfter = await prisma.entityNode.findMany({ where: { listId }, select: { name: true } });
    expect(copyAfter.map(n => n.name).sort()).toEqual(["Analyst", "Company", "Finance"]);
  });

  it("one list per kind per project: re-adopt without replace throws 409, with replace overwrites", async () => {
    const first = await adoptStructure(w.project.id, w.org.id, w.master.id);

    // A second org master of the same kind to re-adopt from.
    const master2 = await prisma.entityList.create({
      data: { name: "Acme Org v2", kind: "OrgStructure", orgId: w.org.id },
    });
    await prisma.entityNode.create({
      data: { listId: master2.id, name: "Solo", level: "Organisation", sortOrder: 0 },
    });

    // Without replace → 409 conflict, and the first copy survives.
    await expect(adoptStructure(w.project.id, w.org.id, master2.id))
      .rejects.toMatchObject({ status: 409 });
    expect(await prisma.entityList.findUnique({ where: { id: first.listId } })).not.toBeNull();

    // With replace → old project copy + nodes gone, new one in place.
    const second = await adoptStructure(w.project.id, w.org.id, master2.id, { replace: true });
    expect(second.listId).not.toBe(first.listId);
    expect(await prisma.entityList.findUnique({ where: { id: first.listId } })).toBeNull();
    expect(await prisma.entityNode.count({ where: { listId: first.listId } })).toBe(0);
    const newNodes = await prisma.entityNode.findMany({ where: { listId: second.listId } });
    expect(newNodes.map(n => n.name)).toEqual(["Solo"]);

    // Only ONE project-scoped OrgStructure list exists.
    expect(await prisma.entityList.count({ where: { projectId: w.project.id, kind: "OrgStructure" } })).toBe(1);
  });

  it("a master from a DIFFERENT org cannot be adopted (404)", async () => {
    const { org: otherOrg } = await createUserWithOrg();
    const foreign = await prisma.entityList.create({
      data: { name: "Foreign", kind: "OrgStructure", orgId: otherOrg.id },
    });
    await expect(adoptStructure(w.project.id, w.org.id, foreign.id))
      .rejects.toMatchObject({ status: 404 });
    expect(AdoptStructureError).toBeDefined();
  });
});
