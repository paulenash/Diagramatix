/**
 * Scoring one Voice Assist case: did it work, and if not, **which layer failed**.
 *
 * The single most expensive failure mode in this feature's history is fixing
 * the wrong layer — a session spent adding keyword boosts when the words were
 * heard perfectly and the grammar was what refused them. Worse, every keyword
 * boost is a bet against every other word: `lane:3` once beat "one" on a
 * numbered pick, and "turn on gold flashing" came back as "ten on gold
 * flashing". So the answer here is never "it failed"; it is which of four
 * things to go and look at.
 *
 * A WATERFALL — the first failing layer wins, one label per row. It is
 * tempting to report every layer that disagreed, and it makes a hundred-row
 * table unreadable: if the recogniser mangled the sentence, the parser's
 * opinion of the mangled text is not a finding.
 *
 * ONE SCORER, TWO LEGS. Pass `transcript: undefined` for the free text leg and
 * a real transcript for the recorded-audio leg. Both go through this function,
 * which is what makes the cheap corpus and the expensive one directly
 * comparable — and is "one rule, one place" applied to the measurement itself.
 */
import { parseCommand } from "./commandGrammar";
import { resolveRef } from "./resolveRef";
import type { AssistOp } from "./ops";
import type { GeneratedCase } from "./commandGenerator";
import type { DiagramData, DiagramElement } from "../diagram/types";
import { scoreApply } from "./applyScore";

export type Outcome =
  /** Right ops, right elements. */
  | "pass"
  /**
   * The recogniser got the words wrong and the answer came out right anyway.
   * NOT a failure — counting it as one makes the audio leg look far worse than
   * it is, and hides the cases where a mis-hear actually cost something.
   */
  | "pass-despite-mishear"
  /** L1 — the words came back wrong, and that is why it failed. */
  | "misheard"
  /** L2a — the grammar refused it outright; live, this is what goes to the AI. */
  | "unparsed"
  /** L2b — it parsed, into the wrong shape. */
  | "misparsed"
  /** L3a — the reference named more than one thing; live, the picker opens. */
  | "ambiguous"
  /** L3b — it resolved, to the wrong element. */
  | "wrong-element"
  /** L4 — the ops were right and the diagram came out wrong. */
  | "wrong-edit";

export interface CaseResult {
  caseId: string;
  family: string;
  outcome: Outcome;
  /** What was said (or what the recogniser heard). */
  heard: string;
  /** What the case intended. */
  expected: AssistOp[];
  /** What the grammar produced, or null when it refused. */
  actual: AssistOp[] | null;
  /** True when the transcript differed from the script, whatever the outcome. */
  textDiffered: boolean;
  /** One line naming the thing to go and look at. */
  detail: string;
}

export const FAILING_OUTCOMES: readonly Outcome[] =
  ["misheard", "unparsed", "misparsed", "ambiguous", "wrong-element", "wrong-edit"];

export function isFailure(o: Outcome): boolean {
  return FAILING_OUTCOMES.includes(o);
}

/**
 * Fields that hold a REF rather than a value. Compared by what they resolve to,
 * never by string: "the gateway" and "Approved?" are the same element, and a
 * scorer that compared text would report a failure for a command that worked.
 */
const REF_FIELDS = new Set([
  "ref", "fromRef", "toRef", "afterRef", "hostRef", "poolRef", "refLane",
  "laneRef", "laneA", "laneB", "relativeTo",
]);

/** `swapPools` uses a/b as refs; `swapGatewayPoints` uses them as POINT names. */
const refFieldsFor = (op: string): Set<string> =>
  op === "swapPools" ? new Set([...REF_FIELDS, "a", "b"]) : REF_FIELDS;

/**
 * Fold the spelling differences a recogniser introduces, for COMPARISON only.
 *
 * "call Sales Fulfilment" came back as "fulfillment" four times in Paul's
 * corpus — `language=en-AU` notwithstanding, Deepgram spells it American. The
 * command worked: a pool was created, with a name one letter off the one in his
 * mouth. Scoring that as a failure counts a spelling variant as a broken
 * command and overstates the problem by four points.
 *
 * NOT HIDDEN, THOUGH. A case that only differs this way still has
 * `textDiffered: true`, so it scores `pass-despite-mishear` and stays visible
 * in the outcome table as something the recogniser changed. Passing it silently
 * as a clean `pass` would be moving the goalposts; marking it as "worked, but
 * the words differed" is what actually happened.
 */
function foldSpelling(s: string): string {
  return s
    .replace(/fulfill?ment/g, "fulfilment")
    .replace(/\blabell?ed\b/g, "labelled")
    .replace(/\bcancell?ed\b/g, "cancelled")
    .replace(/(\w+)ization\b/g, "$1isation")
    .replace(/(\w+)ize\b/g, "$1ise")
    .replace(/(\w+)yze\b/g, "$1yse")
    .replace(/\bcolor\b/g, "colour")
    .replace(/\bcenter\b/g, "centre");
}

/** Everything except the refs — the shape the grammar promised to produce. */
function shapeOf(op: AssistOp): Record<string, unknown> {
  const refs = refFieldsFor(op.op);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(op as Record<string, unknown>)) {
    if (refs.has(k)) continue;
    if (v === undefined) continue;
    // Labels compare case-insensitively on the first word: the recogniser
    // capitalises sentence-initially and a person does not, and that is not a
    // defect worth a red row.
    out[k] = typeof v === "string" ? foldSpelling(v.trim().toLowerCase())
      : Array.isArray(v) ? v.map((x) => (typeof x === "string" ? foldSpelling(x.trim().toLowerCase()) : x))
        : v;
  }
  return out;
}

/**
 * A canonical string for one op's shape, with the KEYS SORTED.
 *
 * `JSON.stringify` preserves insertion order, so `{label, position}` and
 * `{position, label}` stringify differently — and the grammar builds its op
 * objects in whatever order its branches happen to assign. Comparing raw JSON
 * reported a dozen identical ops as mismatches on the first run, which is the
 * sort of thing that makes a harness worse than useless: it manufactures
 * failures and trains the reader to ignore it.
 */
const canonical = (op: AssistOp): string => {
  const s = shapeOf(op);
  return JSON.stringify(Object.keys(s).sort().map((k) => [k, s[k]]));
};

const sameShape = (a: AssistOp[], b: AssistOp[]): boolean =>
  a.length === b.length && a.every((op, i) => canonical(op) === canonical(b[i]));

/**
 * Did the recogniser hear DIFFERENT WORDS, or just punctuate?
 *
 * The first batch run over Paul's corpus (2026-09-24) came back with all 73
 * passes labelled `pass-despite-mishear` and none clean — which reads as "the
 * recogniser mangled every single sentence and we got away with it". It had
 * not. `smart_format` capitalises the first word and adds a full stop, so
 * "delete Review" comes back "Delete review." — and a lower-cased string
 * comparison called that a mis-hear, in all one hundred cases.
 *
 * A mis-hear is a changed WORD. Capitalisation and punctuation are rendering.
 * Comparing word sequences keeps the label meaning something: a sentence
 * Deepgram split with an inserted full stop still differs, because "three" and
 * "3" are different words and the parser genuinely sees them differently.
 */
function sameWords(a: string, b: string): boolean {
  const words = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  const x = words(a), y = words(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

/** Which fields differ, for a readable failure line. */
function shapeDiff(want: AssistOp, got: AssistOp): string {
  const w = shapeOf(want), g = shapeOf(got);
  const keys = [...new Set([...Object.keys(w), ...Object.keys(g)])].sort();
  const bits = keys
    .filter((k) => JSON.stringify(w[k]) !== JSON.stringify(g[k]))
    .map((k) => `${k}: wanted ${JSON.stringify(w[k]) ?? "nothing"}, got ${JSON.stringify(g[k]) ?? "nothing"}`);
  return bits.join("; ");
}

interface RefCheck {
  ok: boolean;
  ambiguous: boolean;
  detail: string;
}

/** Compare every ref field by RESOLUTION against the same fixture. */
function checkRefs(expected: AssistOp[], actual: AssistOp[], world: readonly DiagramElement[]): RefCheck {
  for (let i = 0; i < expected.length; i++) {
    const refs = refFieldsFor(expected[i].op);
    const e = expected[i] as unknown as Record<string, unknown>;
    const a = actual[i] as unknown as Record<string, unknown>;
    for (const field of refs) {
      const want = e[field];
      const got = a[field];
      if (typeof want !== "string" || !want) continue;
      if (typeof got !== "string" || !got) {
        return { ok: false, ambiguous: false, detail: `${field}: expected “${want}”, got nothing` };
      }
      const wr = resolveRef(want, [...world]);
      const gr = resolveRef(got, [...world]);
      if (gr && "ambiguous" in gr) {
        return { ok: false, ambiguous: true, detail: `${field}: “${got}” names ${gr.ambiguous.length} things` };
      }
      const wantId = wr && "id" in wr ? wr.id : null;
      const gotId = gr && "id" in gr ? gr.id : null;
      if (!gotId) return { ok: false, ambiguous: false, detail: `${field}: “${got}” matched nothing` };
      if (wantId && gotId !== wantId) {
        return { ok: false, ambiguous: false, detail: `${field}: “${got}” found ${gotId}, wanted ${wantId}` };
      }
    }
  }
  return { ok: true, ambiguous: false, detail: "" };
}

/**
 * Score one case.
 *
 * `transcript` is what the recogniser heard. Pass `undefined` for the text leg,
 * where there is no recogniser and the script IS the input — L1 is then skipped
 * rather than assumed to have passed, which is the honest reading.
 */
export function scoreCase(
  c: GeneratedCase,
  transcript: string | undefined,
  world: readonly DiagramElement[],
  /** Pass the whole diagram (normally `fixtureDiagram()`) to score L4 as well. */
  opts: { diagram?: DiagramData } = {},
): CaseResult {
  const heard = (transcript ?? c.utterance).trim();
  const textDiffered = transcript !== undefined && !sameWords(transcript, c.utterance);

  const base = { caseId: c.id, family: c.family, heard, expected: c.ops, textDiffered };

  const actual = parseCommand(heard);
  if (!actual || actual.length === 0) {
    // Refused. WHOSE fault depends on whether the words even arrived intact:
    // the same null means "the recogniser mangled it" or "the grammar has no
    // rule for this", and telling them apart is the point of the whole harness.
    return {
      ...base, actual: null,
      outcome: textDiffered ? "misheard" : "unparsed",
      detail: textDiffered
        ? `heard “${heard}” instead of “${c.utterance}”`
        : "the grammar has no rule for this phrasing — live, it would go to the AI",
    };
  }

  if (!sameShape(c.ops, actual)) {
    return {
      ...base, actual,
      outcome: textDiffered ? "misheard" : "misparsed",
      detail: textDiffered
        ? `heard “${heard}”, which parsed to something else`
        : c.ops.length === actual.length && c.ops.every((o, i) => o.op === actual[i].op)
          // Same ops, different fields — say WHICH, or the reader has to diff
          // two JSON blobs by eye to find out that one word was dropped.
          ? c.ops.map((o, i) => shapeDiff(o, actual[i])).filter(Boolean).join(" · ")
          : `parsed as ${actual.map((o) => o.op).join(" + ")}, expected ${c.ops.map((o) => o.op).join(" + ")}`,
    };
  }

  const refs = checkRefs(c.ops, actual, world);
  if (!refs.ok) {
    return {
      ...base, actual,
      outcome: refs.ambiguous ? "ambiguous" : "wrong-element",
      detail: refs.detail,
    };
  }

  // L4 — apply the ops the grammar produced to a headless copy of the diagram
  // and check what came out. Only when the caller hands over a whole diagram:
  // the element list alone cannot be run through the reducer.
  if (opts.diagram) {
    const v = scoreApply(actual, opts.diagram, c.needsSelection);
    if (!v.ok) return { ...base, actual, outcome: "wrong-edit", detail: v.detail };
  }
  return {
    ...base, actual,
    outcome: textDiffered ? "pass-despite-mishear" : "pass",
    detail: textDiffered ? `heard “${heard}” but the answer was right anyway` : "",
  };
}

export interface ScoreSummary {
  total: number;
  passed: number;
  failed: number;
  byOutcome: Record<string, number>;
  byFamily: Record<string, { total: number; passed: number; failed: number }>;
  /** What share of cases the deterministic grammar refused — the AI's real bill. */
  fallbackRate: number;
}

export function summarise(results: readonly CaseResult[]): ScoreSummary {
  const byOutcome: Record<string, number> = {};
  const byFamily: Record<string, { total: number; passed: number; failed: number }> = {};
  let passed = 0, unparsed = 0;
  for (const r of results) {
    byOutcome[r.outcome] = (byOutcome[r.outcome] ?? 0) + 1;
    const fam = byFamily[r.family] ??= { total: 0, passed: 0, failed: 0 };
    fam.total++;
    if (isFailure(r.outcome)) fam.failed++; else { fam.passed++; passed++; }
    if (r.outcome === "unparsed") unparsed++;
  }
  return {
    total: results.length,
    passed,
    failed: results.length - passed,
    byOutcome,
    byFamily,
    fallbackRate: results.length ? unparsed / results.length : 0,
  };
}
