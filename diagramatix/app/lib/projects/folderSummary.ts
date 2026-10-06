/**
 * What a folder holds — the Folder Properties panel's summary (Paul, 2026-10-06: "Left-Click on a Folder entry → display a new Folder
 * Properties Panel displaying a summary of the contents"). Pure, so it is unit-tested without the screen.
 */
export interface FolderLike { id: string; name: string; parentId: string | null }
export interface DiagramLike { id: string; name: string; type: string; updatedAt: string | Date }
export interface FolderTreeLike { folders: FolderLike[]; diagramFolderMap: Record<string, string> }

export interface FolderSummary {
  /** Names from the project down to this folder, e.g. ["Claims", "Intake"]. */
  path: string[];
  direct: { diagrams: number; folders: number };
  /** This folder and everything under it. */
  total: { diagrams: number; folders: number };
  /** Diagrams anywhere under the folder, by type, most first. */
  byType: { type: string; count: number }[];
  /** The most recently changed diagrams under the folder (newest first, at most `recentLimit`). */
  recent: { id: string; name: string; type: string; updatedAt: string }[];
  /** The latest change anywhere under the folder, or null when it is empty. */
  lastChanged: string | null;
  empty: boolean;
}

const iso = (d: string | Date) => (d instanceof Date ? d.toISOString() : d);

export function summariseFolder(tree: FolderTreeLike, diagrams: readonly DiagramLike[], folderId: string, rootId: string, recentLimit = 5): FolderSummary {
  const parentOf = (f: FolderLike) => f.parentId ?? rootId;
  const childrenOf = (id: string) => tree.folders.filter((f) => parentOf(f) === id);

  // Everything under the folder (guarding a cyclic parent chain from a damaged file).
  const under = new Set<string>([folderId]);
  const stack = [folderId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of childrenOf(cur)) if (!under.has(c.id)) { under.add(c.id); stack.push(c.id); }
  }
  const inFolder = (d: DiagramLike) => (tree.diagramFolderMap[d.id] ?? rootId) === folderId;
  const inTree = (d: DiagramLike) => under.has(tree.diagramFolderMap[d.id] ?? rootId);

  const all = diagrams.filter(inTree);
  const types = new Map<string, number>();
  for (const d of all) types.set(d.type, (types.get(d.type) ?? 0) + 1);

  const path: string[] = [];
  const byId = new Map(tree.folders.map((f) => [f.id, f] as const));
  for (let cur = byId.get(folderId), n = 0; cur && n < 64; n++) { path.unshift(cur.name); cur = cur.parentId ? byId.get(cur.parentId) : undefined; }

  const sorted = [...all].sort((a, b) => iso(b.updatedAt).localeCompare(iso(a.updatedAt)));
  return {
    path,
    direct: { diagrams: diagrams.filter(inFolder).length, folders: childrenOf(folderId).length },
    total: { diagrams: all.length, folders: under.size - 1 },
    byType: [...types.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type)),
    recent: sorted.slice(0, recentLimit).map((d) => ({ id: d.id, name: d.name, type: d.type, updatedAt: iso(d.updatedAt) })),
    lastChanged: sorted[0] ? iso(sorted[0].updatedAt) : null,
    empty: all.length === 0 && under.size === 1,
  };
}
