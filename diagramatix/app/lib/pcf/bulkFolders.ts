/**
 * Pure folder-tree helpers for SuperAdmin bulk APQC process generation. The
 * bulk feature walks the PROJECT'S seeded folders (never the full APQC
 * framework): one diagram per folder, non-leaf folders decompose into a linked
 * sub-process per child folder, leaf folders are AI-generated. Ordering the
 * subtree deepest-first guarantees a child's diagram exists before its parent
 * links to it.
 */
export interface BulkFolder { id: string; name: string; parentId: string | null }

/** A folder + all its descendants (self first) from a flat folder list. */
export function folderSubtree(folders: BulkFolder[], rootId: string): BulkFolder[] {
  const out: BulkFolder[] = [];
  const walk = (fid: string) => {
    const n = folders.find((f) => f.id === fid);
    if (n) out.push({ id: n.id, name: n.name, parentId: n.parentId });
    for (const c of folders.filter((f) => f.parentId === fid)) walk(c.id);
  };
  walk(rootId);
  return out;
}

/** Direct child folders of `folderId` within a subtree. */
export function childrenInSubtree(subtree: BulkFolder[], folderId: string): BulkFolder[] {
  return subtree.filter((f) => f.parentId === folderId);
}

/** Order a subtree deepest-first: every folder appears after all of its own
 *  descendants, so a parent can link to already-created child diagrams. */
export function orderDeepestFirst(subtree: BulkFolder[]): BulkFolder[] {
  const ids = new Set(subtree.map((s) => s.id));
  const depth = (s: BulkFolder) => {
    let n = 0;
    let cur: BulkFolder | undefined = s;
    while (cur?.parentId && ids.has(cur.parentId)) { n++; cur = subtree.find((x) => x.id === cur!.parentId); }
    return n;
  };
  return [...subtree].sort((a, b) => depth(b) - depth(a));
}

/** The leading dotted APQC code parsed from a seeded folder name ("1.1.1 Foo" → "1.1.1"). */
export const folderCode = (name: string): string => name.match(/^(\d+(?:\.\d+)*)/)?.[1] ?? "";

/** A folder name with its leading APQC code stripped ("1.1.1 Foo" → "Foo"). */
export const folderCodeStrip = (name: string): string => name.replace(/^(\d+(?:\.\d+)*)\s*/, "").trim();
