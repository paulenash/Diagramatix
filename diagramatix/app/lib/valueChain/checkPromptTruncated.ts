/**
 * Did the model stop mid-sentence?
 *
 * Paul, 2026-09-04, regenerating V22 on Opus 5: V22.07's prompt came back at
 * 1,878 characters where its siblings ran 6,000-8,000, and it ended
 *
 *     - branch "
 *
 * mid-token. It was saved, it was PUBLISHED, and it drove a diagram generation.
 * Every check we had passed it: `checkPromptBranches` looks for a malformed
 * branch, and a dangling `- branch "` is not a malformed branch, it is no branch
 * at all — so a truncated document is invisible to a checker built to read
 * well-formed ones. `AiInvocation.truncated` recorded the `max_tokens` stop for
 * 7 of that run's 35 calls, and nothing acted on it.
 *
 * The generator now refuses a truncated response outright (`generateMdPrompt`),
 * which is the real fix. This exists for the second half of the problem: prompts
 * ALREADY stored, and truncation that arrives some other way — a dropped stream,
 * a proxy cutting a response — where no stop reason is available to consult.
 *
 * The two signals were validated against all 277 stored BPMN prompts before
 * being trusted: together they flag exactly the 6 known-bad ones and none of the
 * 271 others. Neither is sufficient alone, which is why both are here — V22.10
 * has balanced quotes but an unclosed final line, and V22.03 the reverse.
 */

/** Why a prompt looks unfinished, or null when it looks complete. */
export function looksTruncated(prompt: string): string | null {
  const text = prompt ?? "";
  if (!text.trim()) return null; // empty is a different fault, reported elsewhere

  // (a) Quotes come in pairs in this house style — every label, every branch
  //     condition, every element name. An odd count anywhere in the document
  //     means one was opened and never closed.
  const quotes = (text.match(/"/g) ?? []).length;
  if (quotes % 2 === 1) {
    return `unbalanced quotes (${quotes}) — a name was opened and never closed, so the text stops mid-instruction`;
  }

  // (b) The last line, on its own. A document can have balanced quotes overall
  //     and still break off inside its final instruction, which is what the
  //     total count cannot see.
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const last = lines[lines.length - 1] ?? "";
  if (((last.match(/"/g) ?? []).length % 2) === 1) {
    return `the last line has an unclosed name: "${last.trim().slice(-60)}"`;
  }

  // (c) A final line that ends on a connective is a sentence that was still
  //     going. Deliberately narrow: these are words no finished instruction
  //     ends on, so it costs nothing to insist.
  if (/[,;:]$|\b(and|or|to|from|the|a|an|with|for|by|of|in|at|into)$/i.test(last.trim())) {
    return `the last line ends mid-sentence: "${last.trim().slice(-60)}"`;
  }

  return null;
}
