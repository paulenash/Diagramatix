/** Server-side node CRUD for Entity Lists. Callers (org + project routes)
 *  authorise first, then delegate the listId-scoped work here. */
import { prisma } from "@/app/lib/db";
import { ENTITY_NODE_LEVELS, ORG_STRUCTURE_LEVELS, type EntityNodeLevel } from "./types";

export class NodeOpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export type MoveAction = "promote" | "demote" | "up" | "down";
export const MOVE_ACTIONS: MoveAction[] = ["promote", "demote", "up", "down"];

/** Pull the optional SharePoint-link fields (Document nodes) out of an input. */
type SpInput = { spDriveId?: unknown; spItemId?: unknown; spName?: unknown; spWebUrl?: unknown };
function spFields(input: SpInput, forUpdate: boolean): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  for (const k of ["spDriveId", "spItemId", "spName", "spWebUrl"] as const) {
    // On create, only include provided values; on update, allow explicit clearing.
    if (forUpdate ? k in input : input[k] !== undefined) out[k] = str(input[k]);
  }
  return out;
}

/** Create a node in a list. parentId must (when set) belong to the same list. */
export async function createNode(
  listId: string,
  input: { name?: unknown; level?: unknown; parentId?: unknown; sortOrder?: unknown } & SpInput,
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
  return prisma.entityNode.create({ data: { listId, name, level, parentId, sortOrder, ...spFields(input, false) } });
}

/** Update a node (rename / move / re-level / reorder). */
export async function updateNode(
  listId: string,
  nodeId: string,
  input: { name?: unknown; level?: unknown; parentId?: unknown; sortOrder?: unknown } & SpInput,
) {
  const node = await prisma.entityNode.findFirst({ where: { id: nodeId, listId }, select: { id: true } });
  if (!node) throw new NodeOpError("Not found", 404);
  const data: { name?: string; level?: EntityNodeLevel; parentId?: string | null; sortOrder?: number } & Record<string, string | null> = { ...spFields(input, true) };
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

// ── Move between levels (promote / demote / reorder) ────────────────────────
// The OrgStructure invariant is level == ORG_STRUCTURE_LEVELS[min(depth, 3)]
// (add-child derives levels via childLevelFor). So promoting/demoting a node
// reparents it AND re-levels its whole subtree by depth — a pure function.

export interface MoveNodeLite { id: string; parentId: string | null; level: EntityNodeLevel; name: string; sortOrder: number }
export interface MoveUpdate { id: string; parentId?: string | null; level?: EntityNodeLevel; sortOrder?: number }

const levelForDepth = (d: number): EntityNodeLevel =>
  ORG_STRUCTURE_LEVELS[Math.min(Math.max(d, 0), ORG_STRUCTURE_LEVELS.length - 1)];

/**
 * Compute the minimal node updates for a move. Pure (no DB), unit-testable.
 * Returns [] (a no-op) when the move isn't possible (already top-level / no
 * previous sibling / already at a sibling bound).
 */
export function planMove(nodes: MoveNodeLite[], nodeId: string, action: MoveAction): MoveUpdate[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const node = byId.get(nodeId);
  if (!node) throw new NodeOpError("Not found", 404);

  const siblings = (pid: string | null) =>
    nodes.filter((n) => n.parentId === pid).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const depthOf = (n: MoveNodeLite): number => {
    let d = 0, cur = n.parentId; const seen = new Set<string>();
    while (cur && !seen.has(cur)) { seen.add(cur); d++; cur = byId.get(cur)?.parentId ?? null; }
    return d;
  };
  const endSort = (pid: string | null) => {
    const s = siblings(pid);
    return (s.length ? Math.max(...s.map((x) => x.sortOrder)) : -1) + 1;
  };

  // Reorder among siblings — swap sortOrder with the adjacent one. No re-level.
  if (action === "up" || action === "down") {
    const sibs = siblings(node.parentId);
    const idx = sibs.findIndex((s) => s.id === nodeId);
    const swap = action === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= sibs.length) return [];
    return [{ id: node.id, sortOrder: sibs[swap].sortOrder }, { id: sibs[swap].id, sortOrder: node.sortOrder }];
  }

  // Reparent (promote → grandparent; demote → previous sibling), then re-level.
  let newParentId: string | null;
  if (action === "promote") {
    if (node.parentId === null) return []; // already top-level
    newParentId = byId.get(node.parentId)!.parentId; // grandparent (or null)
  } else {
    const sibs = siblings(node.parentId);
    const idx = sibs.findIndex((s) => s.id === nodeId);
    if (idx <= 0) return []; // no previous sibling to demote under
    newParentId = sibs[idx - 1].id;
  }

  const oldDepth = depthOf(node);
  const newDepth = newParentId === null ? 0 : depthOf(byId.get(newParentId)!) + 1;
  const delta = newDepth - oldDepth;

  const updates: MoveUpdate[] = [
    { id: node.id, parentId: newParentId, sortOrder: endSort(newParentId), level: levelForDepth(newDepth) },
  ];
  // Re-level descendants — their depth shifts by the same delta as the moved node.
  const collect = (pid: string): MoveNodeLite[] => {
    const kids = nodes.filter((n) => n.parentId === pid);
    return kids.flatMap((k) => [k, ...collect(k.id)]);
  };
  for (const desc of collect(node.id)) {
    const lvl = levelForDepth(depthOf(desc) + delta);
    if (lvl !== desc.level) updates.push({ id: desc.id, level: lvl });
  }
  return updates;
}

/** Apply a move (promote/demote/up/down) atomically. */
export async function moveNode(listId: string, nodeId: string, action: MoveAction) {
  if (!MOVE_ACTIONS.includes(action)) throw new NodeOpError("Invalid move action", 400);
  const nodes = await prisma.entityNode.findMany({
    where: { listId }, select: { id: true, parentId: true, level: true, name: true, sortOrder: true },
  });
  if (!nodes.some((n) => n.id === nodeId)) throw new NodeOpError("Not found", 404);
  const updates = planMove(nodes as MoveNodeLite[], nodeId, action);
  if (updates.length) {
    await prisma.$transaction(updates.map((u) => prisma.entityNode.update({
      where: { id: u.id },
      data: {
        ...(u.parentId !== undefined ? { parentId: u.parentId } : {}),
        ...(u.level !== undefined ? { level: u.level } : {}),
        ...(u.sortOrder !== undefined ? { sortOrder: u.sortOrder } : {}),
      },
    })));
  }
}

/** Delete a node (cascades to children via the schema relation). */
export async function deleteNode(listId: string, nodeId: string) {
  const node = await prisma.entityNode.findFirst({ where: { id: nodeId, listId }, select: { id: true } });
  if (!node) throw new NodeOpError("Not found", 404);
  await prisma.entityNode.delete({ where: { id: nodeId } });
}
