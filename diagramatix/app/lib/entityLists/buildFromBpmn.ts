/**
 * Build a NAMED, reusable org-level Entity Structure from a project's BPMN
 * diagrams. Mirrors the shape of `POST /api/orgs/[id]/entity-structures` (a named
 * `EntityStructure` + its five org-scoped lists), but the SOURCE is the project's
 * pools/lanes/sublanes/shapes instead of empty lists. The result appears in the
 * project's "Adopt a structure…" list and is editable as a master under
 * Admin → Entity Lists.
 *
 * All five lists are populated:
 *   • Organisation Hierarchy — white-box Pool→Organisation, Lane→OrgUnit, Sublane→Team
 *   • External Participants   — black-box (non-system) pools
 *   • IT Systems              — black-box "system" pools + System / Process-System shapes
 *   • Documents               — Data Object shapes
 *   • Data Stores             — Data Store shapes
 * Names are deduped across all the project's diagrams.
 */
import { prisma } from "@/app/lib/db";
import { extractOrgTreeFromBpmn, extractFlatEntitiesFromBpmn, type OrgTreeNode } from "./bpmnOrgTree";
import { normalizeEntityName } from "@/app/lib/portal/entityIndex";
import {
  STRUCTURE_LIST_KINDS, ENTITY_LIST_KIND_LABELS, FLAT_LEVEL_FOR,
  type EntityListKind,
} from "./types";

export interface BuildStructureResult {
  /** "" when nothing was found in the BPMN (no structure created). */
  structureId: string;
  name: string;
  added: {
    organisations: number; orgUnits: number; teams: number;
    participants: number; systems: number; documents: number; dataStores: number;
  };
}

export async function buildStructureFromBpmn(
  orgId: string,
  projectId: string,
  name: string | undefined,
): Promise<BuildStructureResult> {
  const diagrams = await prisma.diagram.findMany({
    where: { projectId, type: "bpmn" }, select: { data: true },
  });
  const tree = extractOrgTreeFromBpmn(diagrams);
  const flat = extractFlatEntitiesFromBpmn(diagrams);
  const added = { organisations: 0, orgUnits: 0, teams: 0, participants: 0, systems: 0, documents: 0, dataStores: 0 };
  const structName = name?.trim() || "BPMN structure";

  // Nothing to build → don't create an empty named structure.
  const flatTotal = flat.participants.length + flat.systems.length + flat.documents.length + flat.dataStores.length;
  if (tree.length === 0 && flatTotal === 0) return { structureId: "", name: structName, added };

  const structureId = await prisma.$transaction(async (tx) => {
    const s = await tx.entityStructure.create({ data: { name: structName, orgId } });
    const listByKind = new Map<EntityListKind, string>();
    for (const kind of STRUCTURE_LIST_KINDS) {
      const l = await tx.entityList.create({
        data: { name: ENTITY_LIST_KIND_LABELS[kind], kind, orgId, structureId: s.id }, select: { id: true },
      });
      listByKind.set(kind, l.id);
    }

    // Organisation Hierarchy — insert parents-first.
    const orgListId = listByKind.get("OrgStructure")!;
    const insertTree = async (node: OrgTreeNode, parentId: string | null, sortOrder: number) => {
      const created = await tx.entityNode.create({ data: { listId: orgListId, parentId, name: node.name, level: node.level, sortOrder } });
      if (node.level === "Organisation") added.organisations++;
      else if (node.level === "OrgUnit") added.orgUnits++;
      else added.teams++;
      let i = 0;
      for (const c of node.children) await insertTree(c, created.id, i++);
    };
    let ri = 0;
    for (const root of tree) await insertTree(root, null, ri++);

    // Flat lists.
    const insertFlat = async (kind: EntityListKind, names: string[], key: keyof typeof added) => {
      const listId = listByKind.get(kind)!;
      const level = FLAT_LEVEL_FOR[kind]!;
      let i = 0;
      for (const nm of names) { await tx.entityNode.create({ data: { listId, name: nm, level, sortOrder: i++ } }); added[key]++; }
    };
    await insertFlat("Participant", flat.participants, "participants");
    await insertFlat("System", flat.systems, "systems");
    await insertFlat("Document", flat.documents, "documents");
    await insertFlat("DataStore", flat.dataStores, "dataStores");

    return s.id;
  });

  return { structureId, name: structName, added };
}

export interface MergeStructureResult {
  added: BuildStructureResult["added"];
}

/**
 * Merge the BPMN-derived entities into THIS PROJECT'S current Entity Structure,
 * adding only what's missing and keeping everything already there (incl. manual
 * additions). Non-destructive counterpart to adoption's wipe-and-re-clone.
 *
 * Matching is name-insensitive (normalizeEntityName). The Org Hierarchy is merged
 * by path — a BPMN node matches an existing node with the same normalized name
 * under the same parent; unmatched nodes (and their subtrees) are appended. A
 * project list is created for a kind only if the project doesn't have one yet.
 */
export async function mergeMissingFromBpmn(projectId: string): Promise<MergeStructureResult> {
  const diagrams = await prisma.diagram.findMany({ where: { projectId, type: "bpmn" }, select: { data: true } });
  const tree = extractOrgTreeFromBpmn(diagrams);
  const flat = extractFlatEntitiesFromBpmn(diagrams);
  const added = { organisations: 0, orgUnits: 0, teams: 0, participants: 0, systems: 0, documents: 0, dataStores: 0 };

  await prisma.$transaction(async (tx) => {
    const ensureList = async (kind: EntityListKind): Promise<string> => {
      const found = await tx.entityList.findFirst({ where: { projectId, kind }, select: { id: true } });
      if (found) return found.id;
      const made = await tx.entityList.create({ data: { name: ENTITY_LIST_KIND_LABELS[kind], kind, projectId }, select: { id: true } });
      return made.id;
    };

    // Organisation Hierarchy — path-based merge (parent + normalized name).
    const orgListId = await ensureList("OrgStructure");
    const orgNodes = await tx.entityNode.findMany({ where: { listId: orgListId }, select: { id: true, parentId: true, name: true, sortOrder: true } });
    const key = (parentId: string | null, name: string) => `${parentId ?? "root"}::${normalizeEntityName(name)}`;
    const existing = new Map(orgNodes.map((n) => [key(n.parentId, n.name), n.id]));
    const nextSort = new Map<string, number>();
    for (const n of orgNodes) { const k = n.parentId ?? "root"; nextSort.set(k, Math.max(nextSort.get(k) ?? 0, n.sortOrder + 1)); }
    const mergeNode = async (node: OrgTreeNode, parentId: string | null) => {
      const k = key(parentId, node.name);
      let id = existing.get(k);
      if (!id) {
        const sk = parentId ?? "root";
        const so = nextSort.get(sk) ?? 0; nextSort.set(sk, so + 1);
        const created = await tx.entityNode.create({ data: { listId: orgListId, parentId, name: node.name, level: node.level, sortOrder: so } });
        id = created.id; existing.set(k, id);
        if (node.level === "Organisation") added.organisations++;
        else if (node.level === "OrgUnit") added.orgUnits++;
        else added.teams++;
      }
      for (const c of node.children) await mergeNode(c, id);
    };
    for (const root of tree) await mergeNode(root, null);

    // Flat lists — append names not already present.
    const mergeFlat = async (kind: EntityListKind, names: string[], countKey: keyof typeof added) => {
      const listId = await ensureList(kind);
      const nodes = await tx.entityNode.findMany({ where: { listId }, select: { name: true, sortOrder: true } });
      const have = new Set(nodes.map((n) => normalizeEntityName(n.name)));
      let so = nodes.reduce((m, n) => Math.max(m, n.sortOrder + 1), 0);
      const level = FLAT_LEVEL_FOR[kind]!;
      for (const nm of names) {
        if (have.has(normalizeEntityName(nm))) continue;
        await tx.entityNode.create({ data: { listId, name: nm, level, sortOrder: so++ } });
        have.add(normalizeEntityName(nm)); added[countKey]++;
      }
    };
    await mergeFlat("Participant", flat.participants, "participants");
    await mergeFlat("System", flat.systems, "systems");
    await mergeFlat("Document", flat.documents, "documents");
    await mergeFlat("DataStore", flat.dataStores, "dataStores");
  });

  return { added };
}
