/**
 * "Check against the parser" — where the command tree and `parseCommand` disagree.
 *
 * Plan slice 4 (new features/voice-assist-help-plan-2026-10-01.md). The tree is a LENS: the
 * parser acts on commands, so the danger is DRIFT — the help offering words the parser will not
 * take, or the parser taking sentences the help never offers. This runs both directions:
 *
 *   tree → parser   every sentence the patterns describe is given to the parser
 *   parser → tree   every sentence the parser is known to take (the Commands card, the frozen answer
 *                   key, the generated corpus) is given to the tree
 *
 * Run against the SuperAdmin's DRAFT edit in the tile, so an edit that creates a disagreement is seen
 * before it is saved. Pure: the sentences and the parser are passed in, nothing is fetched.
 */
import type { CommandTree, WalkContext } from "./tree";

export interface ReportLine {
  sentence: string;
  /** Where it came from: a pattern line ("line 12"), "card", "frozen key" or "generated". */
  source: string;
}

export interface ConsistencyReport {
  /** The tree describes it; the parser does not take it. */
  treeNotParser: ReportLine[];
  /** The parser takes it; the tree does not describe it. */
  parserNotTree: ReportLine[];
  checked: { fromTree: number; card: number; frozen: number; generated: number };
}

export interface ConsistencyInput {
  /** Samples for each <variable>, so a pattern becomes a sentence. */
  fill: Record<string, readonly string[]>;
  /** At most this many sentences per pattern line (default 120). */
  cap?: number;
  /** Sentences the parser is known to take. */
  card: readonly string[];
  frozen: readonly string[];
  generated: readonly string[];
  /** Does the parser take this as a command? (`parseCommand(s) !== null`) */
  parses: (sentence: string) => boolean;
  /** What the tree is asked with — the names on the diagram, Assist suggestions showing. */
  ctx?: WalkContext;
}

/** "move top to top", "swap middle and centre" — the same point twice: no parser would take them. */
const POINT = (w: string) => (w === "centre" || w === "center" ? "middle" : w);
export function isMeaningless(sentence: string): boolean {
  const m = sentence.match(/^(?:move|swap)(?: .*?)? (top|middle|bottom|left|right|centre|center) (?:to|and|with) (top|middle|bottom|left|right|centre|center)$/);
  return !!m && POINT(m[1]) === POINT(m[2]);
}

export function consistencyReport(tree: CommandTree, input: ConsistencyInput): ConsistencyReport {
  const ctx = input.ctx ?? {};
  const treeNotParser: ReportLine[] = [];
  const parserNotTree: ReportLine[] = [];
  let fromTree = 0;

  for (const { pattern, sentence } of tree.samples("commands", input.fill, input.cap ?? 120)) {
    if (isMeaningless(sentence)) continue;
    fromTree++;
    if (!input.parses(sentence)) treeNotParser.push({ sentence, source: `line ${pattern.line}` });
  }

  const seen = new Set<string>();
  // Parser → tree is about the GRAMMAR, so it is asked without the diagram's names: a sentence that
  // names something the test diagram does not have (the card's "remove the sublane Sub 2" on a diagram
  // with no sublanes) is rightly refused by the names rule and is not drift.
  const { names: _names, ...grammarCtx } = ctx;
  void _names;
  const check = (list: readonly string[], source: string) => {
    for (const s of list) {
      // Only sentences the parser really takes count as "the parser takes it".
      if (!input.parses(s)) continue;
      const key = s.trim().toLowerCase();
      if (!tree.accepts(s, { ghost: true, ...grammarCtx })) {
        if (!seen.has(key)) { seen.add(key); parserNotTree.push({ sentence: s, source }); }
      }
    }
  };
  check(input.card, "card");
  check(input.frozen, "frozen key");
  check(input.generated, "generated");

  return {
    treeNotParser,
    parserNotTree,
    checked: { fromTree, card: input.card.length, frozen: input.frozen.length, generated: input.generated.length },
  };
}

/**
 * Samples for each <variable>, used to turn a pattern into a sentence. One place, so the tile's check and
 * the tests are the same check.
 */
export const DEFAULT_SAMPLE_FILL: Record<string, readonly string[]> = {
  existing_element_name: ["Review Claim", "Underwriters"],
  existing_label_name: ["Payment Details"],
  new_element_name: ["Finance Review"],
  new_label_name: ["Approved"],
  number: ["3"],
  distance: ["100 pixels"],
  target: ["this", "the selected task"],
  selection: ["these", "the selected tasks"],
};
