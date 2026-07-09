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

/** A folder name with its leading APQC code and trailing 5-digit id stripped
 *  ("1.1.1 Foo (10017)" → "Foo"). */
export const folderCodeStrip = (name: string): string =>
  name.replace(/^(\d+(?:\.\d+)*)\s*/, "").replace(/\s*\(\d{3,}\)\s*$/, "").trim();

/** The trailing 5-digit APQC PCF id parsed from a seeded folder name
 *  ("1.1.1 Foo (10017)" → "10017"), or "" when absent. */
export const folderPcfId = (name: string): string => name.match(/\((\d{3,})\)\s*$/)?.[1] ?? "";

/** The next "(n)" copy name for `base` given the diagram names already in the
 *  target folder — "X" + ["X"] → "X (1)"; then "X (2)", "X (3)", … Numbering
 *  starts at 1 and skips over any existing "(k)" copies. Used by the "Add"
 *  conflict option so a regenerated process sits alongside the existing one. */
export function nextCopyName(base: string, existing: string[]): string {
  const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc} \\((\\d+)\\)$`);
  let max = 0;
  for (const nm of existing) { const m = re.exec((nm ?? "").trim()); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return `${base} (${max + 1})`;
}
