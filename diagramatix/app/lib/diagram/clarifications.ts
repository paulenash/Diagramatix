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
