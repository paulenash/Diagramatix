/** Server-side item + link CRUD for the Risk & Control catalog. Callers (org +
 *  project routes) authorise first, then delegate the libraryId-scoped work
 *  here. Mirrors app/lib/entityLists/nodeOps.ts. */
import { prisma } from "@/app/lib/db";
import { RISK_CONTROL_KINDS, CONTROL_TYPES, CONTROL_AUTOMATIONS, KIND_PREFIX, type RiskControlKind, type ControlType, type ControlAutomation } from "./types";

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
  const automation = input.automation ? (input.automation as ControlAutomation) : null;
  if (automation && !CONTROL_AUTOMATIONS.includes(automation)) throw new ItemOpError("Invalid automation", 400);

  // Default sortOrder = end of the kind group; default code = kind prefix + n.
  const last = await prisma.riskControlItem.findFirst({
    where: { libraryId, kind }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
  });
  const sortOrder = (last?.sortOrder ?? -1) + 1;
  const code = asStr(input.code) || `${KIND_PREFIX[kind]}-${String(sortOrder + 1).padStart(2, "0")}`;
  const isRisk = kind === "Risk", isControl = kind === "Control";
  const generic = !isRisk;   // owner + frameworkRef apply to controls + governance objects

  return prisma.riskControlItem.create({
    data: {
      libraryId, kind, name, code, sortOrder,
      description: asStr(input.description) || null,
      likelihood: isRisk ? asRating(input.likelihood) : null,
      impact: isRisk ? asRating(input.impact) : null,
      riskCategory: isRisk ? (asStr(input.riskCategory) || null) : null,
      residualLikelihood: isRisk ? asRating(input.residualLikelihood) : null,
      residualImpact: isRisk ? asRating(input.residualImpact) : null,
      controlType: isControl ? controlType : null,
      automation: isControl ? automation : null,
      frequency: isControl ? (asStr(input.frequency) || null) : null,
      owner: generic ? (asStr(input.owner) || null) : null,
      frameworkRef: generic ? (asStr(input.frameworkRef) || null) : null,
      evidence: isControl ? (asStr(input.evidence) || null) : null,
      testMethod: isControl ? (asStr(input.testMethod) || null) : null,
      testFrequency: isControl ? (asStr(input.testFrequency) || null) : null,
      monitorSignature: isControl ? (asStr(input.monitorSignature) || null) : null,
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
    if (input.residualLikelihood !== undefined) data.residualLikelihood = asRating(input.residualLikelihood);
    if (input.residualImpact !== undefined) data.residualImpact = asRating(input.residualImpact);
  } else {
    if (input.controlType !== undefined) {
      const ct = input.controlType ? (input.controlType as ControlType) : null;
      if (ct && !CONTROL_TYPES.includes(ct)) throw new ItemOpError("Invalid control type", 400);
      data.controlType = ct;
    }
    if (input.automation !== undefined) {
      const a = input.automation ? (input.automation as ControlAutomation) : null;
      if (a && !CONTROL_AUTOMATIONS.includes(a)) throw new ItemOpError("Invalid automation", 400);
      data.automation = a;
    }
    if (input.frequency !== undefined) data.frequency = asStr(input.frequency) || null;
    if (input.evidence !== undefined) data.evidence = asStr(input.evidence) || null;
    if (input.testMethod !== undefined) data.testMethod = asStr(input.testMethod) || null;
    if (input.testFrequency !== undefined) data.testFrequency = asStr(input.testFrequency) || null;
    if (input.monitorSignature !== undefined) data.monitorSignature = asStr(input.monitorSignature) || null;
  }
  if (item.kind !== "Risk") {
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

/** Link one item to another (a directed traceability edge, source → target).
 *  Any two distinct items in the same library may be linked; the relationship
 *  semantics are inferred from the two kinds. Idempotent on (source, target).
 *  A Control→Risk edge is the RCM mitigation. */
export async function linkItems(libraryId: string, sourceId: string, targetId: string) {
  if (sourceId === targetId) throw new ItemOpError("An item can't link to itself", 400);
  const [source, target] = await Promise.all([
    prisma.riskControlItem.findFirst({ where: { id: sourceId, libraryId }, select: { id: true } }),
    prisma.riskControlItem.findFirst({ where: { id: targetId, libraryId }, select: { id: true } }),
  ]);
  if (!source) throw new ItemOpError("Source item not in this library", 400);
  if (!target) throw new ItemOpError("Target item not in this library", 400);
  return prisma.riskControlLink.upsert({
    where: { sourceId_targetId: { sourceId, targetId } },
    create: { libraryId, sourceId, targetId },
    update: {},
  });
}

/** Remove a traceability link. */
export async function unlinkItems(libraryId: string, sourceId: string, targetId: string) {
  await prisma.riskControlLink.deleteMany({ where: { libraryId, sourceId, targetId } });
}
