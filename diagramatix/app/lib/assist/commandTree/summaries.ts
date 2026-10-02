/**
 * A short "what happens on the diagram" for each first word of a command — for the Voice Assist Help
 * tile's "5. Next words" table (Paul, 2026-10-02: "add a column that has a short summary of what happens
 * on the diagram when this command is issued").
 *
 * It is DERIVED from the Commands card (`commandCatalog.ts`), which already says what each command does
 * and whose examples are proved to parse — so there is no second list of descriptions to go stale. A
 * word's summaries are the `does` lines of every card item that has an example starting with it, cut
 * down to the first clause. A word the card has no example for borrows from its synonyms in the command
 * patterns (the head of a line such as `(rename|relabel) …`).
 *
 * Pure.
 */
import type { CatalogFamily } from "../commandCatalog";

const MAX_CHARS = 90;

/** The first clause of a `does` line: before " — ", before the first full stop, and capped. */
export function shortDoes(does: string): string {
  let s = String(does ?? "").trim();
  const dash = s.indexOf(" — ");
  if (dash > 0) s = s.slice(0, dash);
  const stop = s.search(/\.\s/);
  if (stop > 0) s = s.slice(0, stop);
  s = s.replace(/\.$/, "").trim();
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS - 1).trimEnd()}…` : s;
}

const firstWord = (phrase: string): string =>
  String(phrase ?? "").toLowerCase().replace(/[“”"]/g, "").trim().split(/\s+/)[0]?.replace(/[,.;:!?]+$/g, "") ?? "";

/**
 * Words the command patterns treat as one — the head of a line such as `(rename|relabel) …`. The card
 * gives an example in only one of them, so the rest borrow its summary: "relabel" does what "rename" does.
 */
export function synonymGroups(patternText: string, lists: Readonly<Record<string, readonly string[]>> = {}): string[][] {
  const groups: string[][] = [];
  for (const line of String(patternText ?? "").split(/\r?\n/)) {
    // A word LIST at the head — "{compress_verbs} [the] <name>" — is a group of synonyms too.
    const l = line.trim().match(/^\{([a-z_]+)\}/);
    if (l && lists[l[1]]) {
      const ws = lists[l[1]].map((x) => firstWord(x)).filter(Boolean);
      if (ws.length > 1) groups.push([...new Set(ws)]);
      continue;
    }
    const m = line.trim().match(/^\(([^()]+)\)/);
    if (!m) continue;
    const words = m[1].split("|").map((x) => firstWord(x)).filter((w) => /^[a-z][a-z-]*$/.test(w));
    if (words.length > 1) groups.push([...new Set(words)]);
  }
  return groups;
}

/**
 * first word → its distinct short summaries, in card order. Mic words (stop / yes / no) are left out.
 * With `patternText`, a word that has no summary of its own takes its synonyms'.
 */
export function summariesByFirstWord(catalog: readonly CatalogFamily[], patternText?: string, lists?: Readonly<Record<string, readonly string[]>>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const fam of catalog) {
    for (const item of fam.items) {
      if (item.voice) continue;
      const text = shortDoes(item.does);
      if (!text) continue;
      for (const w of new Set(item.say.map(firstWord).filter(Boolean))) {
        const list = out.get(w) ?? [];
        if (!list.includes(text)) list.push(text);
        out.set(w, list);
      }
    }
  }
  if (patternText) {
    const own = new Map(out);
    for (const group of synonymGroups(patternText, lists)) {
      for (const w of group) {
        if (own.has(w)) continue;
        const list = out.get(w) ?? [];
        for (const mate of group) for (const t of own.get(mate) ?? []) if (!list.includes(t)) list.push(t);
        if (list.length) out.set(w, list);
      }
    }
  }
  return out;
}
