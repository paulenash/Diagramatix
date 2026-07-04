/** Server-side item + link CRUD for the Risk & Control catalog. Callers (org +
 *  project routes) authorise first, then delegate the libraryId-scoped work
 *  here. Mirrors app/lib/entityLists/nodeOps.ts. */
import { prisma } from "@/app/lib/db";
import { RISK_CONTROL_KINDS, CONTROL_TYPES, type RiskControlKind, type ControlType } from "./types";

export class ItemOpError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

const asStr = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asRating = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) throw new ItemOpError("Rating must be 1..5", 400);
  return n;
};

/** Create a Risk or Control in a library. */
export async function createItem(
  libraryId: string,
  input: Record<string, unknown>,
) {
  const kind = input.kind as RiskControlKind;
  if (!RISK_CONTROL_KINDS.includes(kind)) throw new ItemOpError("Invalid kind", 400);
  const name = asStr(input.name);
  if (!name) throw new ItemOpError("Name required", 400);
  const controlType = input.controlType ? (input.controlType as ControlType) : null;
  if (controlType && !CONTROL_TYPES.includes(controlType)) throw new ItemOpError("Invalid control type", 400);

  // Default sortOrder = end of the kind group; default code = kind prefix + n.
  const last = await prisma.riskControlItem.findFirst({
    where: { libraryId, kind }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  const code = asStr(input.code) || `${kind === "Risk" ? "R" : "C"}-${String(sortOrder + 1).padStart(2, "0")}`;

  return prisma.riskControlItem.create({
    data: {
      libraryId, kind, name, code, sortOrder,
      description: asStr(input.description) || null,
      likelihood: kind === "Risk" ? asRating(input.likelihood) : null,
      impact: kind === "Risk" ? asRating(input.impact) : null,
      riskCategory: kind === "Risk" ? (asStr(input.riskCategory) || null) : null,
      controlType: kind === "Control" ? controlType : null,
      frequency: kind === "Control" ? (asStr(input.frequency) || null) : null,
      owner: kind === "Control" ? (asStr(input.owner) || null) : null,
      frameworkRef: kind === "Control" ? (asStr(input.frameworkRef) || null) : null,
    },
  });
}

/** Update an item (any subset of its attributes). */
export async function updateItem(
  libraryId: string,
  itemId: string,
  input: Record<string, unknown>,
) {
  const item = await prisma.riskControlItem.findFirst({ where: { id: itemId, libraryId }, select: { id: true, kind: true } });
  if (!item) throw new ItemOpError("Not found", 404);
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) { const n = asStr(input.name); if (!n) throw new ItemOpError("Name required", 400); data.name = n; }
  if (input.code !== undefined) { const c = asStr(input.code); if (c) data.code = c; }
  if (input.description !== undefined) data.description = asStr(input.description) || null;
  if (typeof input.sortOrder === "number") data.sortOrder = input.sortOrder;
  if (item.kind === "Risk") {
    if (input.likelihood !== undefined) data.likelihood = asRating(input.likelihood);
    if (input.impact !== undefined) data.impact = asRating(input.impact);
    if (input.riskCategory !== undefined) data.riskCategory = asStr(input.riskCategory) || null;
  } else {
    if (input.controlType !== undefined) {
      const ct = input.controlType ? (input.controlType as ControlType) : null;
      if (ct && !CONTROL_TYPES.includes(ct)) throw new ItemOpError("Invalid control type", 400);
      data.controlType = ct;
    }
    if (input.frequency !== undefined) data.frequency = asStr(input.frequency) || null;
    if (input.owner !== undefined) data.owner = asStr(input.owner) || null;
    if (input.frameworkRef !== undefined) data.frameworkRef = asStr(input.frameworkRef) || null;
  }
  return prisma.riskControlItem.update({ where: { id: itemId }, data });
}

/** Delete an item (cascades its mitigation links via the schema relation). */
export async function deleteItem(libraryId: string, itemId: string) {
  const item = await prisma.riskControlItem.findFirst({ where: { id: itemId, libraryId }, select: { id: true } });
  if (!item) throw new ItemOpError("Not found", 404);
  await prisma.riskControlItem.delete({ where: { id: itemId } });
}

/** Link a Control to a Risk (mitigation). Idempotent on the (control,risk) pair. */
export async function linkMitigation(libraryId: string, controlId: string, riskId: string) {
  const [control, risk] = await Promise.all([
    prisma.riskControlItem.findFirst({ where: { id: controlId, libraryId, kind: "Control" }, select: { id: true } }),
    prisma.riskControlItem.findFirst({ where: { id: riskId, libraryId, kind: "Risk" }, select: { id: true } }),
  ]);
  if (!control) throw new ItemOpError("Control not in this library", 400);
  if (!risk) throw new ItemOpError("Risk not in this library", 400);
  return prisma.riskControlLink.upsert({
    where: { controlId_riskId: { controlId, riskId } },
    create: { libraryId, controlId, riskId },
    update: {},
  });
}

/** Remove a mitigation link. */
export async function unlinkMitigation(libraryId: string, controlId: string, riskId: string) {
  await prisma.riskControlLink.deleteMany({ where: { libraryId, controlId, riskId } });
}
