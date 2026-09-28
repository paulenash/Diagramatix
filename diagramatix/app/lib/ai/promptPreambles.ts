/**
 * The notes put in front of a spoken prompt so the AI reads it for what it is.
 * One place for both, so the desktop consoles and the phone cannot drift.
 */

/**
 * A MEETING recording (the consoles' "Upload / record meeting"): several
 * people, so each distinct speaker is a role / lane.
 */
export const MEETING_TRANSCRIPT_PREAMBLE =
  "Build the BPMN process from this meeting transcript. Treat each distinct speaker as a role / lane, "
  + "and use roles or job functions — never an individual person's name — in pool, lane, task and "
  + "annotation names. Ignore small talk.\n\n";

/**
 * ONE person describing a process aloud (the phone's Generate, 2026-09-28).
 * The meeting preamble would make that one speaker one lane; here the roles
 * come from what is said, not from who says it.
 */
export const SPOKEN_DESCRIPTION_PREAMBLE =
  "Build the BPMN process from this spoken description by one person. Infer the roles or lanes from "
  + "what is said, not from who is speaking, and use roles or job functions — never an individual "
  + "person's name — in pool, lane, task and annotation names. Ignore false starts and filler words.\n\n";

/** The prompt with the one-speaker note in front — once, however often it is applied. */
export function withSpokenPreamble(prompt: string): string {
  const body = prompt.trim();
  if (!body) return body;
  return hasSpokenPreamble(body) ? body : SPOKEN_DESCRIPTION_PREAMBLE + body;
}

export function hasSpokenPreamble(prompt: string): boolean {
  return prompt.trim().startsWith(SPOKEN_DESCRIPTION_PREAMBLE.trim());
}

/** The person's own words, without the note — for putting a prompt back in front of them. */
export function stripSpokenPreamble(prompt: string): string {
  const body = prompt.trim();
  return hasSpokenPreamble(body) ? body.slice(SPOKEN_DESCRIPTION_PREAMBLE.trim().length).trim() : body;
}
