import type { AiFeedback } from "./types";

/**
 * Append the answered AI clarification questions to a generation prompt as a
 * "CLARIFICATIONS" block, so the regenerate accounts for the user's answers.
 * Unanswered questions are omitted. Returns the prompt unchanged if nothing was
 * answered.
 */
export function appendClarifications(prompt: string, feedback: AiFeedback): string {
  const answered = feedback.questions.filter((x) => (x.a ?? "").trim().length > 0);
  if (answered.length === 0) return prompt;
  const block = [
    "CLARIFICATIONS (answers to open questions — incorporate these):",
    ...answered.map((x) => `- Q: ${x.q}\n  A: ${x.a!.trim()}`),
  ].join("\n");
  return prompt.trim() ? `${prompt.trimEnd()}\n\n${block}` : block;
}

const REFINE_HEADER = "CLARIFICATIONS (answers to open questions — incorporate these):";

/**
 * Append answered "Refine" questions to a generation prompt as deterministic
 * labelled lines (`- <label>: <value>`), inside the shared CLARIFICATIONS block.
 * Skipped/empty answers are omitted. Across multiple Refine rounds the new lines
 * MERGE into the single existing block (they don't stack duplicate headers),
 * since Refine always appends at the end of the prompt.
 */
export function appendRefinements(
  prompt: string,
  items: { label: string; answer: string }[],
): string {
  const lines = items
    .filter((x) => (x.answer ?? "").trim().length > 0)
    .map((x) => `- ${x.label.trim()}: ${x.answer.trim()}`);
  if (lines.length === 0) return prompt;
  // A CLARIFICATIONS block already exists (prior round) → just add the new
  // bullets to the end; the block is always the last thing in the prompt.
  if (prompt.includes(REFINE_HEADER)) {
    return `${prompt.trimEnd()}\n${lines.join("\n")}`;
  }
  const block = [REFINE_HEADER, ...lines].join("\n");
  return prompt.trim() ? `${prompt.trimEnd()}\n\n${block}` : block;
}
