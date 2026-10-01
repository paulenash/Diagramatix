/**
 * How the bubble writes a list of next words — one place, shared by the tile's preview and
 * the editor's panel, so what Paul tests in the tile is what he sees in the editor.
 *
 *   word        →  word
 *   optional    →  [word]
 *   <variable>  →  <existing_element_name>
 *   one that is already open and may go on  →  <new_element_name> …
 *
 * ORDER (Paul, 2026-10-01: "What can I say words should be in alphabetic order"): the words A–Z,
 * then the <variables> A–Z — as in his own example, "pools, lanes, tasks, … <existing_element_name>" —
 * then the [optional] ones, words then variables, each A–Z.
 */
import type { NextItem } from "./tree";

export function formatItem(i: NextItem): string {
  const core = i.kind === "slot" ? `<${i.text}>` : i.text;
  const shown = i.optional ? `[${core}]` : core;
  return i.more ? `${shown} …` : shown;
}

const byText = (a: NextItem, b: NextItem) => a.text.localeCompare(b.text, "en", { sensitivity: "base" });

export function formatNext(items: readonly NextItem[]): string[] {
  const group = (optional: boolean, kind: NextItem["kind"]) =>
    items.filter((i) => i.optional === optional && i.kind === kind).sort(byText).map(formatItem);
  return [...group(false, "word"), ...group(false, "slot"), ...group(true, "word"), ...group(true, "slot")];
}
