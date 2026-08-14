/**
 * Namespaced-id ↔ visible-element mapping for the drill-down views.
 *
 * spliceLinkedSubprocesses clones a linked child diagram under its use-site with
 * ids prefixed per level: a node two levels deep is "<subA>~<subB>~<childId>".
 * The replay and heatmap draw ONE diagram at a time, so every assembled node id
 * has to be resolved to a box that diagram actually contains:
 *
 *   viewing the top level      prefix ""          "sub1~task9"  → "sub1"
 *   drilled into sub1          prefix "sub1~"     "sub1~task9"  → "task9"
 *   drilled into sub1          prefix "sub1~"     "sub2~task9"  → null (elsewhere)
 *   drilled into sub1 › sub2   prefix "sub1~sub2~" "sub1~sub2~t" → "t"
 *
 * Kept pure and separate so both views share one definition of "where does this
 * token/statistic belong on screen".
 */

/** The drill prefix for a stack of subprocess ids ("" for the top level). */
export function drillPrefix(subIds: string[]): string {
  return subIds.length ? subIds.join("~") + "~" : "";
}

/**
 * Resolve an assembled node id to the element id visible in the diagram
 * currently on screen, or null when the node lives in a different branch of the
 * splice tree (and so has no box here).
 *
 * Within the current level, anything still carrying a "~" belongs to a deeper
 * splice and rolls up to the outermost subprocess box at this level.
 */
export function visibleNodeId(nodeId: string, prefix = ""): string | null {
  let rest = nodeId;
  if (prefix) {
    if (!rest.startsWith(prefix)) return null;
    rest = rest.slice(prefix.length);
    if (!rest) return null;
  }
  // A leading separator would mean an empty id segment — not a real element.
  if (rest.startsWith("~")) return null;
  const cut = rest.indexOf("~");
  return cut === -1 ? rest : rest.slice(0, cut);
}

/** True when `nodeId` sits at or below the current drill level. */
export function isWithinDrill(nodeId: string, prefix = ""): boolean {
  return visibleNodeId(nodeId, prefix) !== null;
}
