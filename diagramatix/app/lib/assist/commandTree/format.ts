/**
 * How the bubble writes a list of next words — one place, shared by the tile's preview and
 * the editor's panel, so what Paul tests in the tile is what he sees in the editor.
 *
 *   word        →  word
 *   optional    →  [word]
 *   <variable>  →  <existing_element_name>
 *   one that is already open and may go on  →  <new_element_name> …
 */
import type { NextItem } from "./tree";

export function formatItem(i: NextItem): string {
  const core = i.kind === "slot" ? `<${i.text}>` : i.text;
  const shown = i.optional ? `[${core}]` : core;
  return i.more ? `${shown} …` : shown;
}

/** "pools, lanes, tasks, <existing_element_name>, [the]" — required first, optional after. */
export function formatNext(items: readonly NextItem[]): string[] {
  const required = items.filter((i) => !i.optional).map(formatItem);
  const optional = items.filter((i) => i.optional).map(formatItem);
  return [...required, ...optional];
}
