/**
 * Client-safe types + constants for Entity Lists (External Participants,
 * IT Systems, Org Structure). Mirrors the Prisma enums as plain string
 * unions so client components never import the generated Prisma client.
 */

export type EntityListKind = "Participant" | "System" | "OrgStructure";
export const ENTITY_LIST_KINDS: EntityListKind[] = ["Participant", "System", "OrgStructure"];

export type EntityNodeLevel =
  | "Participant" | "System"
  | "Organisation" | "OrgUnit" | "Team" | "Role";
export const ENTITY_NODE_LEVELS: EntityNodeLevel[] =
  ["Participant", "System", "Organisation", "OrgUnit", "Team", "Role"];

/** Human labels for the UI. */
export const ENTITY_LIST_KIND_LABELS: Record<EntityListKind, string> = {
  Participant: "External Participants",
  System: "IT Systems",
  OrgStructure: "Organisation Structure",
};
export const ENTITY_NODE_LEVEL_LABELS: Record<EntityNodeLevel, string> = {
  Participant: "Participant",
  System: "IT System",
  Organisation: "Organisation",
  OrgUnit: "Org Unit",
  Team: "Team",
  Role: "Role",
};

/** The hierarchy levels, ordered top→bottom, for the OrgStructure kind. */
export const ORG_STRUCTURE_LEVELS: EntityNodeLevel[] = ["Organisation", "OrgUnit", "Team", "Role"];

/** Valid child level under a given parent level (null parent = top level). */
export function childLevelFor(parentLevel: EntityNodeLevel | null): EntityNodeLevel {
  if (parentLevel === null) return "Organisation";
  const idx = ORG_STRUCTURE_LEVELS.indexOf(parentLevel);
  return ORG_STRUCTURE_LEVELS[Math.min(idx + 1, ORG_STRUCTURE_LEVELS.length - 1)];
}

/** Is this kind a flat list (no hierarchy)? */
export function isFlatKind(kind: EntityListKind): boolean {
  return kind === "Participant" || kind === "System";
}

// ── DTOs returned by the API ────────────────────────────────────────
export interface EntityNodeDTO {
  id: string;
  listId: string;
  parentId: string | null;
  name: string;
  level: EntityNodeLevel;
  sortOrder: number;
}
export interface EntityListDTO {
  id: string;
  name: string;
  kind: EntityListKind;
  orgId: string | null;
  projectId: string | null;
  sourceListId: string | null;
  nodes: EntityNodeDTO[];
}

/** A node decorated with its depth (0 = top) for indented rendering. */
export interface EntitySuggestion {
  id: string;
  name: string;
  level: EntityNodeLevel;
  parentId: string | null;
  depth: number;
}

/** The active project structure, grouped by kind, loaded into the editor. */
export interface ProjectEntityStructure {
  participants: EntitySuggestion[];
  systems: EntitySuggestion[];
  orgStructure: EntitySuggestion[];
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
      out.push({ id: n.id, name: n.name, level: n.level, parentId: n.parentId, depth });
      walk(n.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
