/**
 * A project's folder tree holds two kinds of thing: its CONTENT (the folders,
 * which diagram is in which, their order) and one piece of VIEW state — each
 * folder's expanded/collapsed flag, saved with the tree so a project reopens
 * as it was left.
 *
 * Expanding or collapsing a folder is not modifying the project (Paul,
 * 2026-09-29: "Why is the APQC Project in prod always top left on the
 * Dashboard?" — the Dashboard lists projects by last modified, and browsing
 * the APQC project's deep PCF folders saved the tree, and bumped it, on every
 * click). PUT /api/projects/[id] asks this before it moves `updatedAt`.
 */

/** A value with every object's keys in order — so two trees that differ only in key order compare equal. */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical(o[k])]));
  }
  return v;
}

/** The tree without its view state: each folder's `collapsed` flag removed. */
function contentOf(tree: unknown): unknown {
  if (!tree || typeof tree !== "object") return tree ?? null;
  const t = tree as { folders?: unknown };
  if (!Array.isArray(t.folders)) return tree;
  return {
    ...t,
    folders: t.folders.map((f) => {
      if (!f || typeof f !== "object") return f;
      const { collapsed: _collapsed, ...rest } = f as Record<string, unknown>;
      void _collapsed;
      return rest;
    }),
  };
}

/**
 * Does saving `next` over `stored` change the project's content? False when
 * the two differ at most in which folders are expanded or collapsed (or not at
 * all) — then the save is a view change and the project's "last modified"
 * stays where it is.
 */
export function folderTreeContentChanged(stored: unknown, next: unknown): boolean {
  return JSON.stringify(canonical(contentOf(stored))) !== JSON.stringify(canonical(contentOf(next)));
}
