/**
 * Two small honesty fixes to what the command log says when something fails.
 * Paul, 21 September 2026, after walking Block 1.
 *
 * ── 1. "The element ids are confusing." ────────────────────────────────────
 *
 * `serializeDiagram` sends the model `<id> [type] "label"` for every element,
 * because it needs ids to describe relationships. The prompt asks for NAMES in
 * refs, but a model given ids will sometimes answer with one — and then the
 * apply layer tried to match `k3f9a2bx` against the labels, failed, and put the
 * id in front of the user:
 *
 *     couldn't find "k3f9a2bx"
 *
 * which is meaningless to anyone who did not write the serialiser. Two things
 * follow. An id that EXISTS should simply resolve — we handed it over, so
 * honouring it is strictly better than failing. An id that does not exist must
 * never be echoed; the user said a name, and the id is an artefact of our own
 * plumbing.
 *
 * ── 2. "Shouldn't the feedback be … there is no Task named Review?" ────────
 *
 * "Add a task before review." → **didn't understand that**. But it WAS
 * understood; the grammar declined on purpose (B5 — "before X" is a position,
 * not a name, and creating a task called "before review" is the defect that
 * rule exists to prevent), the AI then had nothing useful to return because
 * there is no Review on the diagram.
 *
 * "Didn't understand that" sends the user to rephrase a sentence that was
 * fine. Naming the thing that is missing sends them to the actual problem.
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";

/**
 * Element ids are `Math.random().toString(36).slice(2, 10)` — eight characters
 * of lower-case letters and digits (see `nanoid` in `useDiagram.ts`).
 *
 * Requiring BOTH a letter and a digit is what keeps this off real names: a
 * user can call a task "checkout" or "invoice2", and neither is eight
 * characters of mixed case-less soup. It errs toward calling an id a name,
 * which is the safe direction — the worst case is the old behaviour.
 */
export function looksLikeElementId(s: string): boolean {
  const t = s.trim();
  if (!/^[a-z0-9]{8}$/.test(t)) return false;
  return /[a-z]/.test(t) && /[0-9]/.test(t);
}

/**
 * Words that introduce a REFERENCE to something that must already exist.
 *
 * `called` / `named` / `labelled` are deliberately absent: what follows those
 * is a NEW name, and reporting "nothing is called Approve" when the user is
 * busy creating Approve would be worse than saying nothing.
 */
const REFERENCE_PREPOSITIONS =
  /\b(?:after|before|between|from|to|onto|into|beside|next to|above|below|under|around)\s+(.+?)(?=\s+(?:and|then|after|before|to|from|called|named|labell?ed)\b|[.,;!?]|$)/gi;

/**
 * Words that cannot be part of a missing NAME.
 *
 * Pronouns and positions, plus the KIND words — "the selected task", "the
 * gateway", "that pool" are all references the resolver handles by other
 * means, and none of them is a name that could be absent.
 */
const NOISE = new Set([
  "the", "a", "an", "it", "them", "these", "those", "this", "that", "here", "there",
  "everything", "all", "selected", "selection", "highlighted", "one", "ones", "thing",
  "start", "end", "top", "bottom", "left", "right", "middle", "centre", "center",
  "up", "down", "first", "last", "previous", "next",
  "task", "tasks", "gateway", "gateways", "event", "events", "pool", "pools",
  "lane", "lanes", "sublane", "sublanes", "subprocess", "element", "elements",
  "step", "steps", "decision", "cursor", "pointer", "mouse", "them all",
]);

/**
 * A rename says "<old> **to** <new>" — the second half is a name being
 * CREATED, so "to" stops introducing a reference in that sentence. Without
 * this, "rename Check Stock to Verify Stock" reported that nothing is called
 * Verify Stock, which is both true and exactly the wrong thing to say.
 */
const RENAME_SHAPED = /^\s*(?:rename|relabel|call|change|set)\b/i;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
const stripArticle = (s: string) => s.replace(/^(?:the|a|an)\s+/i, "").trim();

/**
 * Names the utterance refers to that are not on the diagram.
 *
 * Deliberately conservative — it is feeding a HELPFUL message, and a wrong
 * "there is nothing called X" is worse than the vague message it replaces. So
 * a mention is only reported when it is a plain phrase, is not a pronoun or a
 * position word, and matches no label even loosely.
 */
export function unresolvedMentions(
  utterance: string,
  elements: readonly DiagramElement[],
  max = 2,
): string[] {
  const labels = elements
    .map((e) => norm(e.label ?? ""))
    .filter(Boolean);

  const out: string[] = [];
  const seen = new Set<string>();
  const renaming = RENAME_SHAPED.test(utterance);

  for (const m of utterance.matchAll(REFERENCE_PREPOSITIONS)) {
    // In a rename, what follows "to" is the new name, not a reference.
    if (renaming && /^to$/i.test(m[0].trim().split(/\s+/)[0])) continue;
    const raw = stripArticle(m[1].trim());
    const said = norm(raw);
    if (!said || said.length < 3) continue;
    if (NOISE.has(said)) continue;
    // A multi-word mention whose every word is noise ("the selected task") is
    // not a name either.
    if (said.split(" ").every((w) => NOISE.has(w))) continue;
    if (looksLikeElementId(said)) continue;          // our own plumbing, not a name
    if (seen.has(said)) continue;

    // Loose on purpose: any label that contains the phrase, or is contained by
    // it, counts as found. Only a mention with NO relationship to any label is
    // worth reporting.
    const found = labels.some((l) => l === said || l.includes(said) || said.includes(l));
    if (found) continue;

    seen.add(said);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Replace element ids in a string with the names they stand for.
 *
 * The apply layer now RESOLVES a bare id (we handed them to the model, so
 * honouring one is better than failing) — but the log still printed the AI's
 * canonical rewrite verbatim, so Paul saw
 *
 *     "connect qruut4v9 to ksjm25kj" → connected Back order → Merge
 *
 * The command was right; the sentence describing it was written in our
 * internal vocabulary (Paul, 2026-09-21). An id with no element left is shown
 * as "something", because printing it is what we are trying to stop.
 */
export function humaniseIds(text: string, elements: readonly DiagramElement[]): string {
  if (!text) return text;
  const byId = new Map(elements.map((e) => [e.id, (e.label ?? "").trim() || e.type]));
  return text.replace(/\b[a-z0-9]{8}\b/g, (tok) => {
    if (!looksLikeElementId(tok)) return tok;
    return byId.get(tok) ?? "something";
  });
}

/**
 * The sentence to show when the AI came back with nothing.
 *
 * Falls back to the old wording when there is no better explanation, because
 * "didn't understand that" is at least true in that case.
 */
export function notUnderstoodMessage(
  utterance: string,
  elements: readonly DiagramElement[],
): string {
  const missing = unresolvedMentions(utterance, elements);
  if (!missing.length) return "didn’t understand that";
  const names = missing.map((n) => `“${n}”`).join(" or ");
  return `nothing here is called ${names} — say a name that is on the diagram`;
}
