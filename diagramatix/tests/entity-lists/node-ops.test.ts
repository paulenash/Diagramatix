/**
 * Entity-list node operations validation (#8c).
 *
 * Tests the node-CRUD lib (createNode / updateNode / deleteNode / NodeOpError in
 * app/lib/entityLists/nodeOps.ts) directly against the test DB — no mocks, no
 * extraction. Pins the validation branches (empty name, invalid level, bad
 * parent, self-parent, unknown node) + the happy paths, plus the delete cascade
 * to children (via the schema relation).
 *
 * Levels come from ENTITY_NODE_LEVELS:
 *   "Participant" | "System" | "Organisation" | "OrgUnit" | "Team" | "Role".
 * NodeOpError carries a numeric `.status` (400 validation, 404 unknown node).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUserWithOrg } from "../_setup/factories";
import { createNode, updateNode, deleteNode } from "@/app/lib/entityLists/nodeOps";

/** Seed an OrgStructure list with one Organisation node + a Team child under it. */
async function seed() {
  const { org } = await createUserWithOrg();
  const list = await prisma.entityList.create({
    data: { name: "Acme", kind: "OrgStructure", orgId: org.id },
  });
  const root = await prisma.entityNode.create({
    data: { listId: list.id, name: "Company", level: "Organisation", sortOrder: 0 },
  });
  const child = await prisma.entityNode.create({
    data: { listId: list.id, parentId: root.id, name: "Finance", level: "Team", sortOrder: 0 },
  });
  return { org, list, root, child };
}
type World = Awaited<ReturnType<typeof seed>>;

describe("entity lists — node ops validation", () => {
  let w: World;
  beforeEach(async () => { await truncateAll(); w = await seed(); });

  describe("createNode", () => {
    it("empty name → NodeOpError 400", async () => {
      await expect(createNode(w.list.id, { name: "   ", level: "Team" }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("invalid level → 400", async () => {
      await expect(createNode(w.list.id, { name: "X", level: "Bogus" }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("parentId not in this list → 400", async () => {
      await expect(createNode(w.list.id, { name: "X", level: "Team", parentId: "cnotinlist0000000000000" }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("valid → creates a top-level node in the list", async () => {
      const node = await createNode(w.list.id, { name: "Marketing", level: "Team", parentId: null });
      expect(node.listId).toBe(w.list.id);
      expect(node.name).toBe("Marketing");
      expect(node.parentId).toBeNull();
    });
    it("valid with a parent → creates the node under that parent", async () => {
      const node = await createNode(w.list.id, { name: "Payroll", level: "Role", parentId: w.child.id });
      expect(node.parentId).toBe(w.child.id);
    });
  });

  describe("updateNode", () => {
    it("unknown node → 404", async () => {
      await expect(updateNode(w.list.id, "cunknownnode00000000000", { name: "X" }))
        .rejects.toMatchObject({ status: 404 });
    });
    it("empty name → 400", async () => {
      await expect(updateNode(w.list.id, w.child.id, { name: "  " }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("invalid level → 400", async () => {
      await expect(updateNode(w.list.id, w.child.id, { level: "Bogus" }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("parentId === nodeId (self-parent) → 400", async () => {
      await expect(updateNode(w.list.id, w.child.id, { parentId: w.child.id }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("parentId not in list → 400", async () => {
      await expect(updateNode(w.list.id, w.child.id, { parentId: "cnotinlist0000000000000" }))
        .rejects.toMatchObject({ status: 400 });
    });
    it("valid rename applies", async () => {
      const updated = await updateNode(w.list.id, w.child.id, { name: "Treasury" });
      expect(updated.name).toBe("Treasury");
    });
    it("valid reparent applies (move child to top level)", async () => {
      const updated = await updateNode(w.list.id, w.child.id, { parentId: null });
      expect(updated.parentId).toBeNull();
    });
  });

  describe("deleteNode", () => {
    it("unknown node → 404", async () => {
      await expect(deleteNode(w.list.id, "cunknownnode00000000000"))
        .rejects.toMatchObject({ status: 404 });
    });
    it("valid leaf delete → the node is gone", async () => {
      await deleteNode(w.list.id, w.child.id);
      expect(await prisma.entityNode.findUnique({ where: { id: w.child.id } })).toBeNull();
    });
    it("deleting a parent cascades to its children (schema relation)", async () => {
      // root parents child; deleting root removes both.
      await deleteNode(w.list.id, w.root.id);
      expect(await prisma.entityNode.findUnique({ where: { id: w.root.id } })).toBeNull();
      expect(await prisma.entityNode.findUnique({ where: { id: w.child.id } })).toBeNull();
      expect(await prisma.entityNode.count({ where: { listId: w.list.id } })).toBe(0);
    });
  });
});
