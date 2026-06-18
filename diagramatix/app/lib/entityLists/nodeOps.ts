/** Server-side node CRUD for Entity Lists. Callers (org + project routes)
 *  authorise first, then delegate the listId-scoped work here. */
import { prisma } from "@/app/lib/db";
import { ENTITY_NODE_LEVELS, type EntityNodeLevel } from "./types";

export class NodeOpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Create a node in a list. parentId must (when set) belong to the same list. */
export async function createNode(
  listId: string,
  input: { name?: unknown; level?: unknown; parentId?: unknown; sortOrder?: unknown },
) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const level = input.level as EntityNodeLevel;
  const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
  if (!name) throw new NodeOpError("Name required", 400);
  if (!ENTITY_NODE_LEVELS.includes(level)) throw new NodeOpError("Invalid level", 400);
  if (parentId) {
    const parent = await prisma.entityNode.findFirst({ where: { id: parentId, listId }, select: { id: true } });
    if (!parent) throw new NodeOpError("Parent not in this list", 400);
  }
  // Default sortOrder = end of the sibling group.
  let sortOrder = typeof input.sortOrder === "number" ? input.sortOrder : undefined;
  if (sortOrder === undefined) {
    const last = await prisma.entityNode.findFirst({
      where: { listId, parentId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
    });
    sortOrder = (last?.sortOrder ?? -1) + 1;
  }
  return prisma.entityNode.create({ data: { listId, name, level, parentId, sortOrder } });
}

/** Update a node (rename / move / re-level / reorder). */
export async function updateNode(
  listId: string,
  nodeId: string,
  input: { name?: unknown; level?: unknown; parentId?: unknown; sortOrder?: unknown },
) {
  const node = await prisma.entityNode.findFirst({ where: { id: nodeId, listId }, select: { id: true } });
  if (!node) throw new NodeOpError("Not found", 404);
  const data: { name?: string; level?: EntityNodeLevel; parentId?: string | null; sortOrder?: number } = {};
  if (input.name !== undefined) {
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name) throw new NodeOpError("Name required", 400);
    data.name = name;
  }
  if (input.level !== undefined) {
    if (!ENTITY_NODE_LEVELS.includes(input.level as EntityNodeLevel)) throw new NodeOpError("Invalid level", 400);
    data.level = input.level as EntityNodeLevel;
  }
  if (input.parentId !== undefined) {
    const parentId = typeof input.parentId === "string" && input.parentId ? input.parentId : null;
    if (parentId) {
      if (parentId === nodeId) throw new NodeOpError("Cannot parent a node to itself", 400);
      const parent = await prisma.entityNode.findFirst({ where: { id: parentId, listId }, select: { id: true } });
      if (!parent) throw new NodeOpError("Parent not in this list", 400);
    }
    data.parentId = parentId;
  }
  if (typeof input.sortOrder === "number") data.sortOrder = input.sortOrder;
  return prisma.entityNode.update({ where: { id: nodeId }, data });
}

/** Delete a node (cascades to children via the schema relation). */
export async function deleteNode(listId: string, nodeId: string) {
  const node = await prisma.entityNode.findFirst({ where: { id: nodeId, listId }, select: { id: true } });
  if (!node) throw new NodeOpError("Not found", 404);
  await prisma.entityNode.delete({ where: { id: nodeId } });
}
