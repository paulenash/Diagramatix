/**
 * Position-aware repair of mis-heard words (Voice Assist Help, plan slice 5).
 *
 * The recogniser's mistakes are mostly near-homophones of a word that WAS expected at that point:
 * "mood" for "move", "to" for "two" where a number is due, "for" for "four", "tree" for "three".
 * The command tree knows exactly which words may come next, so a heard word that the tree does not
 * accept — but which sounds like exactly ONE of the words it does — is repaired to that word.
 *
 * It is deliberately timid, because every earlier keyword boost made recognition worse:
 *   - only a word the tree REJECTS is ever touched (a word that fits is never "improved");
 *   - only when exactly one expected word sounds like it — two candidates means no repair;
 *   - inside a name (an open <variable>) nothing is repaired, since any word fits there;
 *   - the first word that cannot be repaired ends the walk — the rest is left exactly as heard;
 *   - the caller keeps the original and uses the repair only when the parser accepts it (see `repairForRun`).
 *
 * Pure.
 */
import { phoneticKey, MIN_KEY_FOR_FUZZ } from "../phonetic";
import { parseCommand } from "../commandGrammar";
import type { CommandTree, WalkContext } from "./tree";
import { tokenise } from "./tree";

export interface RepairChange { at: number; from: string; to: string }
export interface Repaired { text: string; changes: RepairChange[] }

/** Words the recogniser gives for a number word. */
const NUMBER_HOMOPHONES: Record<string, string> = {
  to: "two", too: "two", tu: "two", for: "four", fore: "four", won: "one", ate: "eight", tree: "three", free: "three",
  tin: "ten", sex: "six", nein: "nine", fife: "five", sleven: "eleven",
};
/** Pairs that sound alike but are not number words. */
const WORD_HOMOPHONES: ReadonlyArray<readonly [string, string]> = [
  ["mood", "move"], ["moved", "move"], ["muse", "move"], ["lain", "lane"], ["pull", "pool"], ["poor", "pool"],
  ["no", "know"], ["bye", "by"], ["right", "write"],
];

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Does `heard` sound like `word`? Short words need a known pairing; longer ones may differ by one sound. */
function soundsLikeWord(heard: string, word: string): boolean {
  if (heard === word) return false;
  if (WORD_HOMOPHONES.some(([h, w]) => h === heard && w === word)) return true;
  if (heard.length < MIN_KEY_FOR_FUZZ || word.length < MIN_KEY_FOR_FUZZ) return false;
  const a = phoneticKey(heard), b = phoneticKey(word);
  if (a && a === b) return true;
  return editDistance(heard, word) <= 1;
}

export function repairByPosition(tree: CommandTree, text: string, ctx: WalkContext = {}): Repaired {
  const tokens = tokenise(text);
  // The words as spoken (case and punctuation kept) when they line up one-to-one with the tokens, so a
  // repaired command keeps the capitals of the names in it.
  const raw = text.trim().split(/\s+/);
  const keep = raw.length === tokens.length ? raw : tokens;
  const shown: string[] = [];
  const out: string[] = [];
  const changes: RepairChange[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const fits = (t: string) => tree.next([...out, t], ctx).ok;
    if (fits(tok)) { out.push(tok); shown.push(keep[i]); continue; }
    const here = tree.next(out, ctx);
    if (!here.ok) { out.push(...tokens.slice(i)); shown.push(...keep.slice(i)); break; }
    // A number is due: a number word heard as something else.
    const wantsNumber = here.next.some((n) => n.kind === "slot" && (n.text === "number" || n.text === "distance"));
    const asNumber = NUMBER_HOMOPHONES[tok];
    if (wantsNumber && asNumber && fits(asNumber)) { changes.push({ at: i, from: tok, to: asNumber }); out.push(asNumber); shown.push(asNumber); continue; }
    const candidates = [...new Set(here.next.filter((n) => n.kind === "word").map((n) => n.text.toLowerCase()))].filter((w) => !w.includes(" ") && soundsLikeWord(tok, w));
    if (candidates.length === 1 && fits(candidates[0])) { changes.push({ at: i, from: tok, to: candidates[0] }); out.push(candidates[0]); shown.push(candidates[0]); continue; }
    out.push(...tokens.slice(i));
    shown.push(...keep.slice(i));
    break;
  }
  return { text: shown.join(" "), changes };
}

/**
 * What to RUN for a heard command. The repair is used only when it turns a command the parser does
 * NOT understand into one it does — a command that already parses is never touched.
 */
export function repairForRun(tree: CommandTree, heard: string): { text: string; changes: RepairChange[] } {
  const original = heard.trim();
  if (!original || parseCommand(original)) return { text: original, changes: [] };
  const r = repairByPosition(tree, original);
  if (!r.changes.length || !parseCommand(r.text)) return { text: original, changes: [] };
  return r;
}
