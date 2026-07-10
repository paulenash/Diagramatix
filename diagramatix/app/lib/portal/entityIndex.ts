/**
 * Process Portal — canonicalise a diagram's raw entity labels against the Org's
 * Entity Lists, with team→role roll-up, so readers can facet/search by "IT
 * System X" or "Team Y" and get a one-click "Involving me" view. Pure over a
 * loaded catalog (the org-master OrgStructure / System / Participant nodes).
 *
 * Matching is normalized-EXACT (case/whitespace/punctuation-insensitive) — no
 * fuzzy matching, so a process is never mis-attributed to the wrong team/system.
 * Labels that match no node are kept as "uncatalogued" facet entries (still
 * findable + a coverage signal), never dropped.
 */
import type { EntityRef, EntityKind } from "@/app/lib/diagram/extractEntities";
import type { FacetValue } from "./facets";

export type ListKind = "OrgStructure" | "System" | "Participant";
export interface CatalogNodeInput { id: string; name: string; parentId: string | null; listKind: ListKind }

/** Diagram entity kind → the Entity-List kind it matches against. */
const KIND_TO_LIST: Record<EntityKind, ListKind> = { system: "System", org: "OrgStructure", participant: "Participant" };
type Group = "system" | "team" | "participant";
const LIST_TO_GROUP: Record<ListKind, Group> = { System: "system", OrgStructure: "team", Participant: "participant" };

export function normalizeEntityName(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

export interface EntityCatalog {
  byKey: Map<string, CatalogNodeInput>;   // `${listKind}::${norm}` → node (first wins)
  label: Map<string, string>;             // nodeId → display name
  parent: Map<string, string | null>;     // nodeId → parentId
}

export function buildEntityCatalog(nodes: CatalogNodeInput[]): EntityCatalog {
  const byKey = new Map<string, CatalogNodeInput>();
  const label = new Map<string, string>();
  const parent = new Map<string, string | null>();
  for (const n of nodes) {
    const key = `${n.listKind}::${normalizeEntityName(n.name)}`;
    if (!byKey.has(key)) byKey.set(key, n);
    label.set(n.id, n.name);
    parent.set(n.id, n.parentId ?? null);
  }
  return { byKey, label, parent };
}

/** Node's ancestor ids (nearest first), cycle-safe. */
export function ancestorsOf(id: string, cat: EntityCatalog): string[] {
  const out: string[] = [];
  const seen = new Set<string>([id]);
  let p = cat.parent.get(id) ?? null;
  while (p && !seen.has(p)) { seen.add(p); out.push(p); p = cat.parent.get(p) ?? null; }
  return out;
}

export interface UncatRef { group: Group; norm: string; name: string }
export interface ResolvedEntities {
  systemIds: string[];        // matched System node ids
  teamIds: string[];          // matched OrgStructure node ids, EXPANDED with ancestors (roll-up)
  participantIds: string[];   // matched Participant node ids
  uncat: UncatRef[];          // unmatched labels, per group
}

/** Resolve a diagram's raw entity refs to canonical node ids (team refs rolled
 *  up to their ancestors) + the leftover uncatalogued labels. */
export function resolveEntities(refs: EntityRef[], cat: EntityCatalog): ResolvedEntities {
  const systemIds = new Set<string>();
  const teamIds = new Set<string>();
  const participantIds = new Set<string>();
  const uncat: UncatRef[] = [];
  const uncatSeen = new Set<string>();
  for (const r of refs) {
    const listKind = KIND_TO_LIST[r.kind];
    const norm = normalizeEntityName(r.name);
    if (!norm) continue;
    const node = cat.byKey.get(`${listKind}::${norm}`);
    if (!node) {
      const group = LIST_TO_GROUP[listKind];
      const key = `${group}::${norm}`;
      if (!uncatSeen.has(key)) { uncatSeen.add(key); uncat.push({ group, norm, name: r.name }); }
      continue;
    }
    if (listKind === "System") systemIds.add(node.id);
    else if (listKind === "Participant") participantIds.add(node.id);
    else { teamIds.add(node.id); for (const a of ancestorsOf(node.id, cat)) teamIds.add(a); }
  }
  return { systemIds: [...systemIds], teamIds: [...teamIds], participantIds: [...participantIds], uncat };
}

// ── Facets + filter over resolved rows ──────────────────────────────────────

const idsFor = (r: ResolvedEntities, g: Group) =>
  g === "system" ? r.systemIds : g === "participant" ? r.participantIds : r.teamIds;

export interface EntityFacets { system: FacetValue[]; team: FacetValue[]; participant: FacetValue[] }

/** Build the three entity facets across the resolved rows. Canonical nodes
 *  (value = node id) ranked by count, then uncatalogued labels
 *  (value = `uncat:${norm}`, flagged) — team counts already roll up. */
export function buildEntityFacets(resolved: ResolvedEntities[], cat: EntityCatalog): EntityFacets {
  const groups: Record<Group, Map<string, FacetValue>> = { system: new Map(), team: new Map(), participant: new Map() };
  const bump = (g: Group, value: string, label: string, uncatalogued: boolean) => {
    const m = groups[g];
    const cur = m.get(value);
    if (cur) cur.count++;
    else m.set(value, { value, label, count: 1, uncatalogued });
  };
  for (const r of resolved) {
    (["system", "team", "participant"] as Group[]).forEach((g) => {
      for (const id of idsFor(r, g)) bump(g, id, cat.label.get(id) ?? id, false);
    });
    for (const u of r.uncat) bump(u.group, `uncat:${u.norm}`, u.name, true);
  }
  const order = (a: FacetValue, b: FacetValue) =>
    Number(!!a.uncatalogued) - Number(!!b.uncatalogued) ||   // canonical before uncatalogued
    b.count - a.count || a.label.localeCompare(b.label);
  return {
    system: [...groups.system.values()].sort(order),
    team: [...groups.team.values()].sort(order),
    participant: [...groups.participant.values()].sort(order),
  };
}

/** Does a resolved row match a selected facet value in a group? A node id
 *  matches when present (teamIds are ancestor-expanded, so picking a team
 *  matches its child-role diagrams); an `uncat:` value matches the raw label. */
export function matchesEntityValue(r: ResolvedEntities, g: Group, selected: string | undefined): boolean {
  if (!selected) return true;
  if (selected.startsWith("uncat:")) {
    const norm = selected.slice(6);
    return r.uncat.some((u) => u.group === g && u.norm === norm);
  }
  return idsFor(r, g).includes(selected);
}

/** "Involving me": the row references one of my teams/roles (or any role
 *  beneath it — teamIds are ancestor-expanded so my node appears on any
 *  descendant's row). */
export function involvesMe(r: ResolvedEntities, myTeamIds: string[]): boolean {
  if (myTeamIds.length === 0) return false;
  const set = new Set(r.teamIds);
  return myTeamIds.some((id) => set.has(id));
}
