/**
 * Resolve a spoken reference ("Review", "the gateway", "it", "the last one") to
 * an element id. Pure. Returns a single id, an ambiguity list (caller asks which
 * one), or null (not found). Used by the Abracadabra apply layer.
 */
import type { DiagramElement } from "../diagram/types";
import { SYMBOL_SYNONYMS, SYMBOL_PHRASES } from "./ops";

export type RefResolution = { id: string } | { ambiguous: string[] } | null;

const LAST_PRONOUNS = new Set(["it", "that", "this", "the last", "the last one", "last one", "the new one"]);
const PREV_PRONOUNS = new Set(["the previous", "previous one", "the previous one", "second last", "the second last", "the one before"]);

// Speech spells numbers as words ("Lane two") but generated names use digits
// ("Lane 2"). Normalise both sides so they match.
const NUM_WORDS: Record<string, string> = {
  zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14",
  fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20",
};
const numNorm = (s: string) => s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (m) => NUM_WORDS[m]);
const norm = (s: string) => numNorm(s.toLowerCase().replace(/[.,!?;:]+$/g, "").trim());
const stripArticle = (s: string) => s.replace(/^(the|a|an)\s+/i, "").trim();
const tokens = (s: string) => norm(s).split(/\s+/).filter(Boolean);

// Bare container type-nouns ("the pool", "pool", "the lane", "sublane") →
// resolveRef never knew these (SYMBOL_SYNONYMS has no pool/lane), so "the pool"
// used to fall through to name-matching and fail. Resolve to the unique / most
// recent element of that container type.
function containerNoun(spoken: string, elements: DiagramElement[]): RefResolution {
  const s = stripArticle(norm(spoken));
  const parentType = (e: DiagramElement) => elements.find((p) => p.id === e.parentId)?.type;
  let items: DiagramElement[] | null = null;
  if (/^pools?$/.test(s)) items = elements.filter((e) => e.type === "pool");
  else if (/^sub-?lanes?$/.test(s)) items = elements.filter((e) => e.type === "lane" && parentType(e) === "lane");
  else if (/^lanes?$/.test(s)) items = elements.filter((e) => e.type === "lane");
  if (!items) return null;
  return items.length ? { id: items[items.length - 1].id } : null; // most-recent
}

function pick(ids: string[]): RefResolution {
  if (ids.length === 0) return null;
  if (ids.length === 1) return { id: ids[0] };
  return { ambiguous: ids };
}

/** Element type a bare type-noun ref refers to, e.g. "the gateway" → "gateway". */
function typeNoun(spoken: string): string | null {
  const s = stripArticle(norm(spoken));
  for (const phrase of SYMBOL_PHRASES) {
    if (s === phrase) return SYMBOL_SYNONYMS[phrase].symbolType;
  }
  return null;
}

// A leading kind word before a name ("sublane Marketing Assistant", "task Prepare")
// is stripped so the remainder matches the element's label. Longest first.
const KIND_PREFIXES = ["sub lane", "sublane", "lane", "pool", "sub process", "subprocess", "boundary event",
  "start event", "end event", "event", "gateway", "decision", "task", "activity", "step"]
  .sort((a, b) => b.length - a.length);
function stripKind(s: string): string {
  // Container collective nouns first, allowing PLURAL + hyphen/space variants so
  // "lanes Sales", "sub-lanes Marketing", "pools Finance" resolve to the bare
  // name. (Only used as a fallback after the full-phrase exact match, so a lane
  // literally named "Lane 2" still resolves via its full label first.)
  const c = s.match(/^(?:sub[-\s]?lanes?|lanes?|pools?)\s+(.+)$/);
  if (c) return c[1].trim();
  for (const k of KIND_PREFIXES) {
    if (s.startsWith(k + " ")) return s.slice(k.length).trim();
  }
  return s;
}

// "the middle pool", "the left lane", "the top pool"… → an element by position.
function positional(spoken: string, elements: DiagramElement[]): RefResolution {
  const s = stripArticle(norm(spoken));
  const m = s.match(/^(first|last|left|right|middle|centre|center|top|bottom)\s+(pool|lane|sublane|sub ?lane)$/);
  if (!m) return null;
  const pos = m[1];
  const kind = m[2].replace(/\s/g, "");
  const isLane = (e: DiagramElement) => e.type === "lane";
  const parentType = (e: DiagramElement) => elements.find((p) => p.id === e.parentId)?.type;
  const items = elements.filter((e) =>
    kind === "pool" ? e.type === "pool"
    : kind === "sublane" ? (isLane(e) && parentType(e) === "lane")
    : isLane(e),
  );
  if (items.length === 0) return null;
  const spreadX = Math.max(...items.map((e) => e.x)) - Math.min(...items.map((e) => e.x));
  const spreadY = Math.max(...items.map((e) => e.y)) - Math.min(...items.map((e) => e.y));
  const byPrimary = [...items].sort(spreadX >= spreadY ? (a, b) => a.x - b.x || a.y - b.y : (a, b) => a.y - b.y || a.x - b.x);
  const byX = [...items].sort((a, b) => a.x - b.x);
  const byY = [...items].sort((a, b) => a.y - b.y);
  const pick =
    pos === "first" ? byPrimary[0] :
    pos === "last" ? byPrimary[byPrimary.length - 1] :
    pos === "left" ? byX[0] :
    pos === "right" ? byX[byX.length - 1] :
    pos === "top" ? byY[0] :
    pos === "bottom" ? byY[byY.length - 1] :
    byPrimary[Math.floor((byPrimary.length - 1) / 2)]; // middle / centre
  return pick ? { id: pick.id } : null;
}

export function resolveRef(spoken: string, elements: DiagramElement[], lastAddedId?: string | null): RefResolution {
  const s = norm(spoken);
  if (!s) return null;

  const pos = positional(s, elements);
  if (pos) return pos;

  // Pronouns / recency. Array order reflects add order (adds append), so the
  // last two entries are "it"/"the last" and "the previous".
  if (LAST_PRONOUNS.has(s)) {
    if (lastAddedId && elements.some((e) => e.id === lastAddedId)) return { id: lastAddedId };
    return elements.length ? { id: elements[elements.length - 1].id } : null;
  }
  if (PREV_PRONOUNS.has(s)) {
    const idx = lastAddedId ? elements.findIndex((e) => e.id === lastAddedId) : elements.length - 1;
    const prev = idx > 0 ? elements[idx - 1] : (elements.length >= 2 ? elements[elements.length - 2] : null);
    return prev ? { id: prev.id } : null;
  }

  // Bare container noun ("the pool", "pool", "sublane") → the unique/most-recent.
  const cont = containerNoun(s, elements);
  if (cont) return cont;

  // Bare type noun ("the gateway", "the end event") → elements of that type.
  const t = typeNoun(s);
  if (t) {
    const ofType = elements.filter((e) => e.type === t);
    // Prefer the most-recent when there are several of a bare type.
    return ofType.length > 1 ? { id: ofType[ofType.length - 1].id } : pick(ofType.map((e) => e.id));
  }

  const fullTarget = stripArticle(s);          // "lane 2"
  const target = stripKind(fullTarget);        // "2"
  const labelled = elements.filter((e) => (e.label ?? "").trim().length > 0);

  // 1. Exact label — try the FULL phrase first ("lane 2" == "Lane 2"), then the
  //    kind-stripped remainder ("Prepare" from "task Prepare").
  const exactFull = labelled.filter((e) => norm(e.label!) === fullTarget);
  if (exactFull.length) return pick(exactFull.map((e) => e.id));
  const exact = labelled.filter((e) => norm(e.label!) === target);
  if (exact.length) return pick(exact.map((e) => e.id));

  // 2. Substring either way ("review" ↔ "Review Invoice").
  const contains = labelled.filter((e) => {
    const l = norm(e.label!);
    return l.includes(target) || target.includes(l);
  });
  if (contains.length) return pick(contains.map((e) => e.id));

  // 3. Token overlap — best-scoring label if it clears a threshold.
  const want = new Set(tokens(target));
  let best: { id: string; score: number } | null = null;
  for (const e of labelled) {
    const ltoks = tokens(e.label!);
    if (ltoks.length === 0) continue;
    const overlap = ltoks.filter((tk) => want.has(tk)).length;
    const score = overlap / Math.max(want.size, ltoks.length);
    if (score >= 0.5 && (!best || score > best.score)) best = { id: e.id, score };
  }
  return best ? { id: best.id } : null;
}
