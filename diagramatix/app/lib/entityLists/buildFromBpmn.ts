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
