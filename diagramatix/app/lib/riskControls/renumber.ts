/** Pure core of the org-wide RCM renumber (scripts/renumber-org-rcm-codes.ts).
 *  Given every library + item in one org, decide each item's new org-wide code so
 *  that clones of the same org-master control keep a single shared code and each
 *  kind is one running sequence. No DB — the script wraps this with the fetch,
 *  the item/sequence writes, and the cached-code rewrite on diagrams. */
import { KIND_PREFIX, type RiskControlKind } from "./types";

export interface RenumberItem { id: string; kind: RiskControlKind; code: string; name: string }
export interface RenumberLib { id: string; isMaster: boolean; sourceLibraryId: string | null; items: RenumberItem[] }

const numOf = (code: string) => { const m = code.match(/(\d+)/); return m ? parseInt(m[1], 10) : 1e9; };

export function assignOrgWideCodes(libs: RenumberLib[]): {
  newCodeByItem: Map<string, string>;
  counters: { kind: RiskControlKind; count: number }[];
} {
  const masterLibIds = new Set(libs.filter((l) => l.isMaster).map((l) => l.id));

  // Canonical key: an item cloned from an org master (its library's sourceLibraryId
  // points at a master, matched by code) shares one group with the master control;
  // everything else is project-local and gets its own group.
  const canonOf = (lib: RenumberLib, it: RenumberItem): string => {
    if (masterLibIds.has(lib.id)) return `m:${lib.id}:${it.kind}:${it.code}`;
    if (lib.sourceLibraryId && masterLibIds.has(lib.sourceLibraryId)) return `m:${lib.sourceLibraryId}:${it.kind}:${it.code}`;
    return `l:${lib.id}:${it.kind}:${it.code}`;
  };

  type Group = { kind: RiskControlKind; oldCode: string; name: string; itemIds: string[] };
  const groups = new Map<string, Group>();
  for (const lib of libs) {
    for (const it of lib.items) {
      const key = canonOf(lib, it);
      const g = groups.get(key) ?? { kind: it.kind, oldCode: it.code, name: it.name, itemIds: [] };
      g.itemIds.push(it.id);
      groups.set(key, g);
    }
  }

  const perKind = new Map<RiskControlKind, Group[]>();
  for (const g of groups.values()) {
    const arr = perKind.get(g.kind) ?? [];
    arr.push(g);
    perKind.set(g.kind, arr);
  }

  const newCodeByItem = new Map<string, string>();
  const counters: { kind: RiskControlKind; count: number }[] = [];
  for (const [kind, gs] of perKind) {
    // Stable order: old numeric code, then raw old code, then name.
    gs.sort((a, b) => (numOf(a.oldCode) - numOf(b.oldCode)) || a.oldCode.localeCompare(b.oldCode) || a.name.localeCompare(b.name));
    gs.forEach((g, i) => {
      const code = `${KIND_PREFIX[kind]}-${String(i + 1).padStart(3, "0")}`;
      for (const id of g.itemIds) newCodeByItem.set(id, code);
    });
    counters.push({ kind, count: gs.length });
  }
  return { newCodeByItem, counters };
}
