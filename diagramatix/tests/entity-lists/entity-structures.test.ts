/**
 * Entity Structures (Phase 1): a named org structure bundles five lists; Document
 * nodes carry an optional SharePoint link; deleting a structure cascades.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { createNode, updateNode } from "@/app/lib/entityLists/nodeOps";
import { STRUCTURE_LIST_KINDS } from "@/app/lib/entityLists/types";

beforeEach(truncateAll);

describe("entity structures", () => {
  it("T0905 — a Document node round-trips its SharePoint link (set / patch / clear)", async () => {
    const { org } = await createUserWithOrg();
    const struct = await prisma.entityStructure.create({ data: { name: "Group", orgId: org.id } });
    const docs = await prisma.entityList.create({ data: { name: "Documents", kind: "Document", orgId: org.id, structureId: struct.id } });

    const node = await createNode(docs.id, {
      name: "Refund Procedure", level: "Document",
      spDriveId: "drive1", spItemId: "item1", spName: "Refund.docx", spWebUrl: "https://sp/refund",
    });
    expect(node.spDriveId).toBe("drive1");
    expect(node.spItemId).toBe("item1");
    expect(node.spName).toBe("Refund.docx");
    expect(node.spWebUrl).toBe("https://sp/refund");

    // Patch only one field — the others are untouched.
    const patched = await updateNode(docs.id, node.id, { spName: "Refund v2.docx" });
    expect(patched.spName).toBe("Refund v2.docx");
    expect(patched.spItemId).toBe("item1");

    // Clear the link (all four explicit nulls).
    const cleared = await updateNode(docs.id, node.id, { spDriveId: null, spItemId: null, spName: null, spWebUrl: null });
    expect(cleared.spDriveId).toBeNull();
    expect(cleared.spWebUrl).toBeNull();
  });

  it("T0906 — a structure bundles the five lists and cascades on delete", async () => {
    const { org } = await createUserWithOrg();
    const struct = await prisma.entityStructure.create({ data: { name: "Group", orgId: org.id } });
    for (const kind of STRUCTURE_LIST_KINDS) {
      await prisma.entityList.create({ data: { name: kind, kind, orgId: org.id, structureId: struct.id } });
    }
    const lists = await prisma.entityList.findMany({ where: { structureId: struct.id } });
    expect(lists.length).toBe(5);
    expect(new Set(lists.map((l) => l.kind))).toEqual(new Set(STRUCTURE_LIST_KINDS));

    // A node under one of the lists.
    const orgList = lists.find((l) => l.kind === "OrgStructure")!;
    await createNode(orgList.id, { name: "Acme", level: "Organisation" });
    expect(await prisma.entityNode.count()).toBe(1);

    // Delete the structure → lists + nodes cascade away.
    await prisma.entityStructure.delete({ where: { id: struct.id } });
    expect(await prisma.entityList.count({ where: { structureId: struct.id } })).toBe(0);
    expect(await prisma.entityNode.count()).toBe(0);
  });
});
