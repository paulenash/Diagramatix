/**
 * The names on the diagram, and whether the words heard so far could be one of them.
 *
 * Paul, 2026-10-01: "move dividers down" showed next words (up, down, left, right …) that were
 * not correct. Cause: a <existing_element_name> variable accepted ANY words, so "dividers" was
 * taken to be the name of an element. Now, when the diagram's names are known (the editor, and
 * the tile's try-it on the test diagram), a name variable takes only words that belong to a
 * real name — or a way of pointing that the resolver understands ("the top lane", "lane 3",
 * "the gateway").
 *
 * Deliberately LENIENT inside a name, because the resolver is: it matches partial names
 * ("claim" for "Review Claim"), in any order. So the rule is "every word that is not a pointing
 * word must begin a word of one real name" — not "must be a prefix of one name".
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "../../diagram/types";

export interface DiagramNames {
  /** Names of activities, pools, lanes and sublanes — what <existing_element_name> means. */
  elements: string[];
  /** Labels of events, gateways, data objects, data stores and connectors/messages — <existing_label_name>. */
  labels: string[];
}

const ELEMENT_TYPES = new Set(["task", "subprocess", "subprocess-expanded", "pool", "lane", "sublane"]);
const LABEL_TYPES = (t: string) => /-event$/.test(t) || t === "gateway" || t === "data-object" || t === "data-store";

export function namesOf(elements: readonly DiagramElement[], connectors: readonly Connector[]): DiagramNames {
  const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
  const elementNames = new Set<string>();
  const labelNames = new Set<string>();
  for (const e of elements) {
    const l = clean(e.label);
    if (!l) continue;
    if (ELEMENT_TYPES.has(e.type)) elementNames.add(l);
    else if (LABEL_TYPES(e.type)) labelNames.add(l);
  }
  for (const c of connectors) {
    const l = clean(c.label);
    if (l) labelNames.add(l);
  }
  return { elements: [...elementNames], labels: [...labelNames] };
}

/** Words that only point or classify — they are never part of a name the user must have said. */
const KIND_NOUNS = new Set([
  "task", "tasks", "activity", "activities", "step", "steps", "subprocess", "subprocesses", "gateway", "gateways",
  "decision", "event", "events", "message", "messages", "connector", "connectors", "flow", "flows", "pool", "pools",
  "lane", "lanes", "sublane", "sublanes", "element", "elements", "label", "labels",
]);
const LEAD = new Set(["the", "a", "an", "this", "that", "my", "all"]);
const POSITIONAL = new Set([
  "top", "bottom", "middle", "upper", "lower", "first", "second", "third", "fourth", "fifth", "last", "next", "previous",
  "left", "right", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
]);

const words = (s: string): string[] => s.toLowerCase().replace(/[^a-z0-9'’\s-]/g, " ").split(/\s+/).filter(Boolean);
const isPointing = (w: string) => LEAD.has(w) || KIND_NOUNS.has(w) || POSITIONAL.has(w) || /^\d+$/.test(w);

/**
 * Could these tokens be (the start of) a name from `names`, or a pointing phrase?
 * `complete`: the slot could end here (what follows may begin).
 */
export function nameFits(tokens: readonly string[], names: readonly string[]): { ok: boolean; complete: boolean } {
  if (!tokens.length) return { ok: true, complete: false };
  const toks = tokens.map((t) => t.toLowerCase().replace(/[.,;:!?]+$/g, ""));
  // Pointing phrase only ("the gateway", "the top lane", "lane 3", "task 2", "this one").
  if (toks.every(isPointing)) {
    return { ok: true, complete: toks.some((t) => KIND_NOUNS.has(t) || POSITIONAL.has(t) || /^\d+$/.test(t)) };
  }
  const real = toks.filter((t) => !isPointing(t));
  const nameWords = names.map(words);
  const fits = (w: string, isLast: boolean) => (nw: string[]) => nw.some((x) => x === w || (isLast && x.startsWith(w)));
  const ok = nameWords.some((nw) => real.every((w, i) => fits(w, i === real.length - 1 && w === toks[toks.length - 1])(nw)));
  return { ok, complete: ok };
}
