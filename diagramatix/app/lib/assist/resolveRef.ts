/**
 * Resolve a spoken reference ("Review", "the gateway", "it", "the last one") to
 * an element id. Pure. Returns a single id, an ambiguity list (caller asks which
 * one), or null (not found). Used by the Voice Assist apply layer.
 */
import type { DiagramElement } from "../diagram/types";
import { SYMBOL_SYNONYMS, SYMBOL_PHRASES } from "./ops";
import { phoneticMatches, soundsLike } from "./phonetic";
import { isSublane, isTopLevelLane } from "../diagram/laneKind";
import { elementUnderPointer, isPointerElementRef } from "./pointerRef";

export type RefResolution = { id: string } | { ambiguous: string[] } | null;

/**
 * R3. A bare type noun — "the gateway", "the pool" — normally resolves to the
 * MOST RECENT one of its kind. That is a deliberate convenience: "add a task
 * after the gateway" almost always means the gateway you just made, and having
 * to name it would make the feature slower than the mouse.
 *
 * It is the wrong answer for a command that DESTROYS something. "delete the
 * task" picking the most recent, with a green tick, is the feature quietly
 * removing the wrong element — and the inconsistency was visible in the
 * product: "delete the lane" already asked which, because containers had their
 * own guard, while "delete the task" did not.
 *
 * `strict` makes a bare type noun with more than one candidate report the
 * ambiguity instead of guessing, so the caller can ask.
 */
export interface ResolveOpts {
  /** Refuse to guess between candidates; report them instead. */
  strict?: boolean;
  /**
   * M5 — where the mouse last was, in world coordinates. Editor state rather
   * than diagram state, so it is passed in rather than derived.
   *
   * It makes two references work: the explicit "the one under the cursor", and
   * a bare "this"/"that" when NOTHING is selected. The selection still wins,
   * so no phrase that worked before changes meaning; pointing at something is
   * simply a better guess than "the last element added" ever was.
   */
  pointer?: { x: number; y: number } | null;
}

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
function containerNoun(spoken: string, elements: DiagramElement[], strict = false): RefResolution {
  const s = stripArticle(norm(spoken));
  let items: DiagramElement[] | null = null;
  if (/^pools?$/.test(s)) items = elements.filter((e) => e.type === "pool");
  // B6 — a sub-lane is a nested lane OR a stamped "sublane"; "lane" on its own
  // means a band directly in a pool. The two sets do not overlap, so a
  // "which one?" count is right either way round.
  else if (/^sub-?lanes?$/.test(s)) items = elements.filter((e) => isSublane(e, elements));
  else if (/^lanes?$/.test(s)) items = elements.filter((e) => isTopLevelLane(e, elements));
  if (!items) return null;
  if (!items.length) return null;
  // Destructive: report the candidates rather than taking the newest.
  if (strict && items.length > 1) return { ambiguous: items.map((e) => e.id) };
  return { id: items[items.length - 1].id }; // most-recent
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
  // B6 — both shapes of a sub-lane count. This pass used to recognise only the
  // nested-parent shape, so "the middle sublane" found nothing on a generated
  // diagram, where the converter stamps `type: "sublane"` instead.
  const items = elements.filter((e) =>
    kind === "pool" ? e.type === "pool"
    : kind === "sublane" ? isSublane(e, elements)
    : isTopLevelLane(e, elements),
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

// ── Multi-modal: the mouse says WHICH, the voice says WHAT ─────────────────
// A selection reference resolves to the elements the user has selected on the
// canvas — never mis-heard, never ambiguous by name. "the selected task" filters
// the selection by kind; "these" / "the selection" is all of it; a bare "this" /
// "that" prefers the selection and falls back to recency when nothing is selected.
const SELECTION_ALL = /^(?:the\s+)?(?:selection|selected(?:\s+(?:elements?|ones?|items?|things?))?|these(?:\s+ones?)?|those(?:\s+ones?)?|highlighted(?:\s+(?:elements?|ones?))?)$/;
const SELECTION_KIND = /^(?:the\s+)?(?:selected|highlighted|chosen)\s+(.+)$/;
const DEMONSTRATIVE = /^(?:this|that|this one|that one)$/;

/** Element type named by a kind word, singular or plural ("tasks", "pool", "sub-lanes"). */
function kindToType(word: string, elements: DiagramElement[]): ((e: DiagramElement) => boolean) | null {
  const w = word.trim().toLowerCase();
  if (/^pools?$/.test(w)) return (e) => e.type === "pool";
  if (/^sub-?lanes?$/.test(w)) return (e) => isSublane(e, elements);
  if (/^lanes?$/.test(w)) return (e) => isTopLevelLane(e, elements);
  // "the selected subprocess" is either kind; "the selected expanded subprocess" / "EP" only the expanded one.
  if (/^(?:expanded\s+)?(?:sub-?\s?process(?:es)?|eps?)$/.test(w)) {
    const expandedOnly = /^(?:expanded|eps?$)/.test(w);
    return (e) => e.type === "subprocess-expanded" || (!expandedOnly && e.type === "subprocess");
  }
  const t = typeNoun(w) ?? typeNoun(w.replace(/(?:es|s)$/, ""));
  return t ? (e) => e.type === t : null;
}

/** Is this phrase a reference to the selection at all (regardless of whether anything is selected)? */
export function isSelectionRef(spoken: string): boolean {
  const s = stripArticle(norm(spoken));
  return SELECTION_ALL.test(s) || SELECTION_KIND.test(s);
}

/**
 * Every selected id the phrase refers to — all of them for "these", the ones of
 * that kind for "the selected task(s)". `null` when the phrase is not a selection
 * reference, or when it is a bare "this"/"that" with nothing selected (so the
 * caller can fall back to "the last one").
 */
export function resolveSelectionRefs(spoken: string, elements: DiagramElement[], selectedIds?: readonly string[]): string[] | null {
  const s = stripArticle(norm(spoken));
  const sel = (selectedIds ?? []).filter((id) => elements.some((e) => e.id === id));
  if (DEMONSTRATIVE.test(s)) return sel.length ? sel : null;
  if (SELECTION_ALL.test(s)) return sel;
  const m = s.match(SELECTION_KIND);
  if (!m) return null;
  const ofKind = kindToType(m[1], elements);
  if (!ofKind) return null;
  return sel.filter((id) => { const e = elements.find((x) => x.id === id); return !!e && ofKind(e); });
}

/** An exact-id reference the editor's guided flows hand to the apply layer ("#id:abc"). Never spoken. */
export const ID_REF_PREFIX = "#id:";

export function resolveRef(spoken: string, elements: DiagramElement[], lastAddedId?: string | null, selectedIds?: readonly string[], opts: ResolveOpts = {}): RefResolution {
  if (spoken.startsWith(ID_REF_PREFIX)) {
    const id = spoken.slice(ID_REF_PREFIX.length);
    return elements.some((e) => e.id === id) ? { id } : null;
  }
  const s = norm(spoken);
  if (!s) return null;

  // M5 — "the one under the cursor" is explicit and beats everything, because
  // saying that whole phrase is unambiguous about what was meant.
  //
  // Tested against `spoken`, NOT `s`: `norm` spells number words as digits so
  // "lane two" matches "Lane 2", which also turns "the ONE under the cursor"
  // into "the 1 under the cursor" and makes the phrase unrecognisable.
  if (isPointerElementRef(spoken)) {
    const under = elementUnderPointer(opts.pointer ?? null, elements);
    return under ? { id: under.id } : null;
  }

  const sel = resolveSelectionRefs(s, elements, selectedIds);
  if (sel) return pick(sel);

  const pos = positional(s, elements);
  if (pos) return pos;

  // Pronouns / recency. Array order reflects add order (adds append), so the
  // last two entries are "it"/"the last" and "the previous".
  if (LAST_PRONOUNS.has(s)) {
    if (lastAddedId && elements.some((e) => e.id === lastAddedId)) return { id: lastAddedId };
    // M5 — with nothing selected and nothing added this session, what the mouse
    // is resting on is a better answer than the last element in the document.
    const under = elementUnderPointer(opts.pointer ?? null, elements);
    if (under) return { id: under.id };
    return elements.length ? { id: elements[elements.length - 1].id } : null;
  }
  if (PREV_PRONOUNS.has(s)) {
    const idx = lastAddedId ? elements.findIndex((e) => e.id === lastAddedId) : elements.length - 1;
    const prev = idx > 0 ? elements[idx - 1] : (elements.length >= 2 ? elements[elements.length - 2] : null);
    return prev ? { id: prev.id } : null;
  }

  // Bare container noun ("the pool", "pool", "sublane") → the unique/most-recent.
  const cont = containerNoun(s, elements, opts.strict);
  if (cont) return cont;

  // Bare type noun ("the gateway", "the end event") → elements of that type.
  const t = typeNoun(s);
  if (t) {
    const ofType = elements.filter((e) => e.type === t);
    // Prefer the most-recent when there are several of a bare type — except
    // under strict, where guessing is precisely what we are avoiding.
    if (ofType.length > 1 && !opts.strict) return { id: ofType[ofType.length - 1].id };
    return pick(ofType.map((e) => e.id));
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
  //
  //    A TIE used to be settled by document order, silently: "shop order"
  //    scores 0.5 against both "Back Order" and "Ship Order", and whichever
  //    came first won. That is a guess wearing a green tick. Ties now ask the
  //    SOUND first — which is what the user got wrong — and failing that
  //    report the ambiguity, which raises the picker.
  const want = new Set(tokens(target));
  let bestScore = 0;
  let bestIds: string[] = [];
  for (const e of labelled) {
    const ltoks = tokens(e.label!);
    if (ltoks.length === 0) continue;
    const overlap = ltoks.filter((tk) => want.has(tk)).length;
    const score = overlap / Math.max(want.size, ltoks.length);
    if (score < 0.5) continue;
    if (score > bestScore) { bestScore = score; bestIds = [e.id]; }
    else if (score === bestScore) bestIds.push(e.id);
  }
  if (bestIds.length === 1) return { id: bestIds[0] };
  if (bestIds.length > 1) {
    const tied = labelled.filter((e) => bestIds.includes(e.id));
    const heard = phoneticMatches(fullTarget, tied, (e) => e.label ?? undefined);
    if (heard.length === 1) return { id: heard[0].id };
    return pick(bestIds);
  }

  // 4. V2 — how it SOUNDS. Last, and only for what the passes above cannot
  //    reach: a single mis-heard word ("escalade" → Escalate), or a word the
  //    recogniser split or joined ("where house" → Warehouse). Multi-word
  //    mis-hears are already handled by the token overlap above, because one
  //    word of two is usually heard correctly.
  //
  //    Several labels sounding alike returns AMBIGUOUS rather than a guess,
  //    which raises the picker — sounding similar is exactly when the user
  //    should be the one to choose.
  const heard = phoneticMatches(fullTarget, labelled, (e) => e.label ?? undefined);
  if (heard.length) return pick(heard.map((e) => e.id));

  return null;
}

/**
 * R6 — the near misses, for "couldn't find X — did you mean Y?".
 *
 * When every pass above fails the user is told the reference did not resolve
 * and nothing else, which leaves them to guess whether they said the wrong
 * name, said it right and were misheard, or are looking at the wrong diagram.
 * The passes had the answer and threw it away: the token-overlap pass computed
 * a score for every label and discarded everything under its threshold, and
 * the phonetic pass knows what the words sounded like.
 *
 * So this re-runs both at a deliberately looser setting. The looseness is safe
 * here and nowhere else: these candidates are only ever put in a QUESTION. An
 * answer this uncertain must not become an action, which is why the thresholds
 * live here rather than being lowered in `resolveRef` itself.
 *
 * Returns at most `max`, best first, never the empty-label elements.
 */
export interface NearMiss {
  id: string;
  label: string;
  /** Why it is a candidate — words in common, or it sounds the same. */
  why: "words" | "sound";
}

/** Below `resolveRef`'s own 0.5: enough in common to be worth naming. */
const NEAR_SCORE = 0.25;

export function nearestRefs(
  spoken: string,
  elements: DiagramElement[],
  max = 3,
): NearMiss[] {
  const fullTarget = stripArticle(norm(spoken));
  if (!fullTarget) return [];
  const target = stripKind(fullTarget);
  const labelled = elements.filter((e) => (e.label ?? "").trim().length > 0);
  const want = new Set(tokens(target));

  const scored = new Map<string, { m: NearMiss; score: number }>();

  for (const e of labelled) {
    const ltoks = tokens(e.label!);
    if (!ltoks.length || !want.size) continue;
    const overlap = ltoks.filter((tk) => want.has(tk)).length;
    if (!overlap) continue;
    const score = overlap / Math.max(want.size, ltoks.length);
    if (score < NEAR_SCORE) continue;
    scored.set(e.id, { m: { id: e.id, label: e.label!, why: "words" }, score });
  }

  // Two edits rather than one — a question may reach further than an action.
  for (const e of labelled) {
    if (scored.has(e.id)) continue;
    if (soundsLike(fullTarget, e.label!, 2)) {
      scored.set(e.id, { m: { id: e.id, label: e.label!, why: "sound" }, score: 0.5 });
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.m.label.localeCompare(b.m.label))
    .slice(0, Math.max(0, max))
    .map((s) => s.m);
}
