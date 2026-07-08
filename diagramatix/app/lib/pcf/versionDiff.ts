/**
 * APQC PCF version diff (Level 5 upgrade wizard). Compares two versions of the
 * same framework family by the STABLE `pcfId` (APQC col A) — the dotted
 * hierarchyId is display-only and not stable across releases. Pure + testable.
 */

export interface DiffNode { pcfId: number; hierarchyId: string; name: string }

export interface VersionDiff {
  added: DiffNode[];                                             // in new, not old
  removed: DiffNode[];                                           // in old, not new
  renamed: { pcfId: number; hierarchyId: string; oldName: string; newName: string }[]; // same pcfId, changed name
  unchanged: number;
}

export function diffPcfVersions(oldNodes: DiffNode[], newNodes: DiffNode[]): VersionDiff {
  const oldByPcf = new Map(oldNodes.map((n) => [n.pcfId, n]));
  const newByPcf = new Map(newNodes.map((n) => [n.pcfId, n]));

  const added: DiffNode[] = [];
  const renamed: VersionDiff["renamed"] = [];
  let unchanged = 0;
  for (const n of newNodes) {
    const prev = oldByPcf.get(n.pcfId);
    if (!prev) { added.push(n); continue; }
    if (prev.name.trim() !== n.name.trim()) renamed.push({ pcfId: n.pcfId, hierarchyId: n.hierarchyId, oldName: prev.name, newName: n.name });
    else unchanged += 1;
  }
  const removed = oldNodes.filter((n) => !newByPcf.has(n.pcfId));

  const byCode = (a: DiffNode, b: DiffNode) => a.hierarchyId.localeCompare(b.hierarchyId, undefined, { numeric: true });
  added.sort(byCode); removed.sort(byCode);
  renamed.sort((a, b) => a.hierarchyId.localeCompare(b.hierarchyId, undefined, { numeric: true }));
  return { added, removed, renamed, unchanged };
}
