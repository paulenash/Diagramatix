/**
 * Finding and replacing the prompt blocks inside a Process Repository `.md`.
 *
 * Shared by the two scripts that write prompts back into the document — the
 * splice-from-a-file one and the regenerate-in-place one. It lives here rather
 * than in either script because this is the part that can silently corrupt a
 * 9,500-line file, and two implementations of it would drift.
 *
 * WHAT COUNTS AS A BLOCK. A ` ```text ` fence directly under a
 * `**<Type> diagram prompt.**` label — exactly what `parseValueChainMd` reads.
 * A BPMN block is additionally identified by the `### <code> — <title>` heading
 * above it, because a chain has one Value Chain prompt but eleven BPMN prompts
 * and the heading is the only thing telling them apart.
 *
 * WHAT IS NEVER DONE. A prompt with no matching block is REPORTED, never
 * appended: an appended prompt lands where the parser reads it as belonging to
 * the wrong diagram, which is worse than it being missing. Offsets are replaced
 * back-to-front so earlier ones stay valid.
 */

/** A prompt block found in a document. */
export interface PromptBlock {
  /** "BPMN", "Value Chain", "Context", "Process Context", "ArchiMate". */
  label: string;
  /** The chain it belongs to ("V03"), from the nearest `##` heading above it. */
  chain: string | null;
  /** For BPMN, the `### …` heading it sits under; null for chain-level prompts. */
  under: string | null;
  /** Absolute offsets of the fence BODY within the source string. */
  start: number;
  end: number;
  /** The prompt text itself, without the fence. */
  text: string;
}

/**
 * LINE ENDINGS. Every pattern here tolerates `\r`, because the document's endings
 * are not stable: the repository `.md` is LF in the repo and git's autocrlf
 * rewrites the working copy to CRLF on checkout. A line-anchored pattern that
 * assumes LF extracts a block body inconsistently — the body keeps or drops a
 * trailing `\r` depending on which side it came from — and splicing it back then
 * changes bytes nobody edited. That is not hypothetical: it is exactly what the
 * `--verify` round trip caught the first time this file was committed.
 *
 * Tolerating `\r` rather than normalising the document is deliberate — the byte
 * OFFSETS are what a splice writes against, and normalising would shift them all.
 */
const LABEL_RE = /^\*\*(Value Chain|Context|Process Context|ArchiMate|BPMN) diagram prompt\.\*\*[ \t\r]*$/gm;

/**
 * Every prompt block in the WHOLE document, in order, each tagged with the chain
 * it belongs to.
 *
 * Run over the whole document deliberately, never over a sliced-out section.
 * Slicing was the original design and it was quietly wrong: `chainSection()`
 * NORMALISES line endings, so on a CRLF working copy its return value does not
 * occur in the document at all — `doc.indexOf(section)` gave -1, every offset was
 * shifted by minus one, and the splice wrote each prompt one character before
 * where it belonged. The bytes still matched in length, so only a round-trip
 * check caught it.
 *
 * Tagging each block with its chain removes the need to locate a section at all:
 * offsets are document-absolute by construction, and a caller filters.
 */
export function findBlocks(src: string): PromptBlock[] {
  const out: PromptBlock[] = [];
  const h3s: { index: number; text: string }[] = [];
  const h3 = /^###[ \t]+(.+?)[ \t\r]*$/gm;
  let hm: RegExpExecArray | null;
  while ((hm = h3.exec(src)) !== null) h3s.push({ index: hm.index, text: hm[1].trim() });

  const h2s: { index: number; code: string }[] = [];
  const h2 = /^##[ \t]+(\S+)/gm;
  let cm: RegExpExecArray | null;
  while ((cm = h2.exec(src)) !== null) h2s.push({ index: cm.index, code: cm[1].trim() });

  LABEL_RE.lastIndex = 0;
  let lm: RegExpExecArray | null;
  while ((lm = LABEL_RE.exec(src)) !== null) {
    const label = lm[1];
    const after = src.slice(lm.index);
    const fence = after.match(/```text[ \t\r]*\r?\n([\s\S]*?)\r?\n?```/);
    if (!fence || fence.index === undefined) continue;
    const bodyStart = lm.index + fence.index + fence[0].indexOf("\n") + 1;
    const bodyEnd = bodyStart + fence[1].length;
    let chain: string | null = null;
    let chainAt = -1;
    for (const h of h2s) if (h.index < lm.index) { chain = h.code; chainAt = h.index; } else break;
    // The subprocess heading must belong to THIS chain. Without that check a
    // chain-level BPMN block — one sitting directly under its `##` with no `###`
    // of its own — inherits the last subprocess heading of the PREVIOUS chain and
    // silently takes its key, so a splice would overwrite the wrong prompt.
    let under: string | null = null;
    for (const h of h3s) if (h.index < lm.index && h.index > chainAt) under = h.text; else if (h.index >= lm.index) break;
    out.push({ label, chain, under: label === "BPMN" ? under : null, start: bodyStart, end: bodyEnd, text: fence[1] });
  }
  return out;
}

/**
 * The key a block is matched on.
 *
 * A chain-level prompt is identified by its type alone. A BPMN prompt needs the
 * subprocess code as well, taken from the heading's leading token — so
 * `### V03.02 — Post to Ledger` keys as `BPMN|V03.02` and survives the title
 * being reworded, which is the part most likely to change between runs.
 */
export const blockKey = (b: PromptBlock): string =>
  b.label === "BPMN" && b.under ? `BPMN|${b.under.split(/[—–-]/)[0].trim()}` : b.label;

/** The blocks belonging to one chain. */
export const blocksOfChain = (blocks: PromptBlock[], chain: string): PromptBlock[] =>
  blocks.filter((b) => b.chain === chain);

/** Replace block bodies, back to front so earlier offsets stay valid. */
export function spliceBlocks(src: string, replacements: { block: PromptBlock; text: string }[]): string {
  let out = src;
  for (const r of [...replacements].sort((a, z) => z.block.start - a.block.start)) {
    out = out.slice(0, r.block.start) + r.text + out.slice(r.block.end);
  }
  return out;
}

/** The signals worth reporting after a regeneration — the Phase 0 evidence. */
export function auditPrompts(text: string): Record<string, number> {
  const count = (re: RegExp) => (text.match(re) ?? []).length;
  return {
    loopBacks: count(/back to "|then back to|returns? to "/gi),
    standardLoops: count(/standard loop/gi),
    mergeGateways: count(/merge gateway/gi),
    waitEvents: count(/ntermediate [a-z ]*catch event/g),
    dataSections: count(/^7\. Data objects/gm),
    dataObjects: count(/Data (Object|Store) "/g),
  };
}
