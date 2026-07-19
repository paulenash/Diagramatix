/**
 * Entity Structures (Phase 2): a project adopts a COPY of a whole structure
 * (all lists, nodes carry sourceNodeId), and "Sync updates" merges master
 * changes (add / rename / remove) while preserving project-local additions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { adoptStructureFull } from "@/app/lib/entityLists/adoptStructure";
import { syncStructure } from "@/app/lib/entityLists/syncStructure";

beforeEach(truncateAll);

/** An org structure: OrgStructure tree (Acme → Finance), one Participant
 *  (Customer), one Document (SharePoint-linked), plus empty System/DataStore. */
async function seedStructure(orgId: string) {
  const struct = await prisma.entityStructure.create({ data: { name: "Head Office", orgId } });
  const os = await prisma.entityList.create({ data: { name: "Org", kind: "OrgStructure", orgId, structureId: struct.id } });
  const acme = await prisma.entityNode.create({ data: { listId: os.id, name: "Acme", level: "Organisation", sortOrder: 0 } });
  const fin = await prisma.entityNode.create({ data: { listId: os.id, parentId: acme.id, name: "Finance", level: "OrgUnit", sortOrder: 0 } });
  const part = await prisma.entityList.create({ data: { name: "Ext", kind: "Participant", orgId, structureId: struct.id } });
  const cust = await prisma.entityNode.create({ data: { listId: part.id, name: "Customer", level: "Participant", sortOrder: 0 } });
  const docs = await prisma.entityList.create({ data: { name: "Docs", kind: "Document", orgId, structureId: struct.id } });
  await prisma.entityNode.create({ data: { listId: docs.id, name: "SOP", level: "Document", sortOrder: 0, spDriveId: "d", spItemId: "i", spName: "SOP.docx", spWebUrl: "https://sp/sop" } });
  await prisma.entityList.create({ data: { name: "Sys", kind: "System", orgId, structureId: struct.id } });
  await prisma.entityList.create({ data: { name: "DS", kind: "DataStore", orgId, structureId: struct.id } });
  return { struct, os, acme, fin, part, cust };
}

describe("adopt + sync structure", () => {
  it("T0907 — adopt clones all five lists with provenance + SharePoint links + tree", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { struct, os, fin } = await seedStructure(org.id);

    const res = await adoptStructureFull(project.id, org.id, struct.id);
    expect(res.lists).toBe(5);

    const copies = await prisma.entityList.findMany({ where: { projectId: project.id }, include: { nodes: true } });
    expect(copies.length).toBe(5);
    const orgCopy = copies.find((l) => l.kind === "OrgStructure")!;
    expect(orgCopy.sourceListId).toBe(os.id);
    const copyAcme = orgCopy.nodes.find((n) => n.name === "Acme")!;
    const copyFin = orgCopy.nodes.find((n) => n.name === "Finance")!;
    expect(copyFin.parentId).toBe(copyAcme.id);      // tree remapped
    expect(copyFin.sourceNodeId).toBe(fin.id);        // provenance
    const docCopy = copies.find((l) => l.kind === "Document")!;
    expect(docCopy.nodes[0].spName).toBe("SOP.docx"); // SharePoint link carried
    expect(docCopy.nodes[0].sourceNodeId).toBeTruthy();
  });

  it("T0908 — Sync adds/renames/removes master changes yet keeps project additions", async () => {
    const { user, org } = await createUserWithOrg();
    const project = await prisma.project.create({ data: { name: "P", userId: user.id, orgId: org.id } });
    const { struct, part, cust, fin } = await seedStructure(org.id);
    await adoptStructureFull(project.id, org.id, struct.id);

    // A project-local ADDITION (no sourceNodeId) that must survive.
    const partCopy = await prisma.entityList.findFirst({ where: { projectId: project.id, kind: "Participant" } });
    await prisma.entityNode.create({ data: { listId: partCopy!.id, name: "Local Vendor", level: "Participant", sortOrder: 9 } });

    // Master changes: rename Customer, add Supplier, delete Finance.
    await prisma.entityNode.update({ where: { id: cust.id }, data: { name: "Client" } });
    await prisma.entityNode.create({ data: { listId: part.id, name: "Supplier", level: "Participant", sortOrder: 1 } });
    await prisma.entityNode.delete({ where: { id: fin.id } });

    const sync = await syncStructure(project.id);
    expect(sync.updated).toBeGreaterThanOrEqual(1);
    expect(sync.added).toBeGreaterThanOrEqual(1);
    expect(sync.removed).toBeGreaterThanOrEqual(1);

    const partAfter = await prisma.entityList.findFirst({ where: { projectId: project.id, kind: "Participant" }, include: { nodes: true } });
    const names = partAfter!.nodes.map((n) => n.name);
    expect(names).toContain("Client");        // master rename applied
    expect(names).toContain("Supplier");      // master addition pulled in
    expect(names).toContain("Local Vendor");  // project addition preserved
    expect(names).not.toContain("Customer");

    const orgAfter = await prisma.entityList.findFirst({ where: { projectId: project.id, kind: "OrgStructure" }, include: { nodes: true } });
    expect(orgAfter!.nodes.some((n) => n.name === "Finance")).toBe(false); // master delete propagated
    expect(orgAfter!.nodes.some((n) => n.name === "Acme")).toBe(true);
  });
});
