/**
 * Client-safe types + constants for Entity Lists (External Participants,
 * IT Systems, Org Structure). Mirrors the Prisma enums as plain string
 * unions so client components never import the generated Prisma client.
 */

export type EntityListKind = "Participant" | "System" | "OrgStructure" | "Document" | "DataStore";
export const ENTITY_LIST_KINDS: EntityListKind[] = ["Participant", "System", "OrgStructure", "Document", "DataStore"];
/** The five lists that make up an Entity Structure, in display order. */
export const STRUCTURE_LIST_KINDS: EntityListKind[] = ["OrgStructure", "Participant", "System", "Document", "DataStore"];

export type EntityNodeLevel =
  | "Participant" | "System"
  | "Organisation" | "OrgUnit" | "Team" | "Role"
  | "Document" | "DataStore";
export const ENTITY_NODE_LEVELS: EntityNodeLevel[] =
  ["Participant", "System", "Organisation", "OrgUnit", "Team", "Role", "Document", "DataStore"];

/** Human labels for the UI. */
export const ENTITY_LIST_KIND_LABELS: Record<EntityListKind, string> = {
  OrgStructure: "Organisation Hierarchy",
  Participant: "External Participants",
  System: "IT Systems",
  Document: "Documents",
  DataStore: "Data Stores",
};
export const ENTITY_NODE_LEVEL_LABELS: Record<EntityNodeLevel, string> = {
  Participant: "Participant",
  System: "IT System",
  Organisation: "Organisation",
  OrgUnit: "Org Unit",
  Team: "Team",
  Role: "Role",
  Document: "Document",
  DataStore: "Data Store",
};

/** The hierarchy levels, ordered top→bottom, for the OrgStructure kind. */
export const ORG_STRUCTURE_LEVELS: EntityNodeLevel[] = ["Organisation", "OrgUnit", "Team", "Role"];

/** The flat (single-level) node level for a flat kind. */
export const FLAT_LEVEL_FOR: Partial<Record<EntityListKind, EntityNodeLevel>> = {
  Participant: "Participant", System: "System", Document: "Document", DataStore: "DataStore",
};

/** Valid child level under a given parent level (null parent = top level). */
export function childLevelFor(parentLevel: EntityNodeLevel | null): EntityNodeLevel {
  if (parentLevel === null) return "Organisation";
  const idx = ORG_STRUCTURE_LEVELS.indexOf(parentLevel);
  return ORG_STRUCTURE_LEVELS[Math.min(idx + 1, ORG_STRUCTURE_LEVELS.length - 1)];
}

/** Is this kind a flat list (no hierarchy)? */
export function isFlatKind(kind: EntityListKind): boolean {
  return kind !== "OrgStructure";
}

// ── DTOs returned by the API ────────────────────────────────────────
export interface EntityNodeDTO {
  id: string;
  listId: string;
  parentId: string | null;
  name: string;
  level: EntityNodeLevel;
  sortOrder: number;
  // Document-kind items: an optional linked SharePoint file.
  spDriveId?: string | null;
  spItemId?: string | null;
  spName?: string | null;
  spWebUrl?: string | null;
  // Project-copy provenance (null on masters + on project additions).
  sourceNodeId?: string | null;
}
export interface EntityListDTO {
  id: string;
  name: string;
  kind: EntityListKind;
  orgId: string | null;
  projectId: string | null;
  structureId: string | null;
  sourceListId: string | null;
  nodes: EntityNodeDTO[];
}
/** A named org-allocated Entity Structure: up to one list per kind. */
export interface EntityStructureDTO {
  id: string;
  name: string;
  orgId: string;
  lists: EntityListDTO[];
}

/** A node decorated with its depth (0 = top) for indented rendering. */
export interface EntitySuggestion {
  id: string;
  name: string;
  level: EntityNodeLevel;
  parentId: string | null;
  depth: number;
  // Document suggestions carry their linked SharePoint file (if any) so naming a
  // Data Object from one can attach the same file to the element.
  spDriveId?: string | null;
  spItemId?: string | null;
  spName?: string | null;
  spWebUrl?: string | null;
}

/** The active project structure, grouped by kind, loaded into the editor. */
export interface ProjectEntityStructure {
  participants: EntitySuggestion[];
  systems: EntitySuggestion[];
  orgStructure: EntitySuggestion[];
  documents: EntitySuggestion[];
  dataStores: EntitySuggestion[];
  /** projectId-scoped EntityList id per kind, for the "add new node" POST. */
  listIds: Partial<Record<EntityListKind, string>>;
}

/** Compute each node's depth by walking parentId; returns sorted suggestions
 *  in a stable pre-order (parents before children, siblings by sortOrder). */
export function toSuggestions(nodes: EntityNodeDTO[]): EntitySuggestion[] {
  const byParent = new Map<string | null, EntityNodeDTO[]>();
  for (const n of nodes) {
    const k = n.parentId;
    const arr = byParent.get(k); if (arr) arr.push(n); else byParent.set(k, [n]);
  }
  for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const out: EntitySuggestion[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const n of byParent.get(parentId) ?? []) {
      out.push({
        id: n.id, name: n.name, level: n.level, parentId: n.parentId, depth,
        spDriveId: n.spDriveId ?? null, spItemId: n.spItemId ?? null, spName: n.spName ?? null, spWebUrl: n.spWebUrl ?? null,
      });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
