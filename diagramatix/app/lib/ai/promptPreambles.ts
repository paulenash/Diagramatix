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

// ── A photographed whiteboard (the phone's Generate, mobile voice stage 2) ────

/** How a whiteboard-photo prompt begins — also what switches the model into
 *  its photo reading (planBpmn: isWhiteboardPhotoPrompt). */
export const WHITEBOARD_PHOTO_OPENING = "Build the BPMN process from the attached photo of a whiteboard or hand-drawn sketch";

/** The heading the person's own words go under: they correct the photo. */
export const PHOTO_CORRECTIONS_HEADING =
  "CORRECTIONS FROM THE PERSON WHO TOOK THE PHOTO (one speaker) — where these add to or contradict the photo, follow them, not the photo:";

/**
 * The note in front of a photo generation. The image's name is in brackets so
 * a desktop re-generate recognises which image the prompt was written for
 * (sourceImage.imageNameInPrompt).
 */
export function whiteboardPhotoNote(imageName: string): string {
  return `${WHITEBOARD_PHOTO_OPENING} (${imageName}). `
    + "Read the handwriting, boxes, arrows, swimlanes and decision diamonds as drawn; ignore glare, reflections, "
    + "smudges, half-erased marks and anything that is not part of the process. Where a word is hard to read, "
    + "choose the reading that makes sense in the process. Use roles or job functions — never an individual "
    + "person's name — in pool, lane, task and annotation names.";
}

/** The whole prompt for a photo: the note, then the person's corrections (if any) under their heading. */
export function withPhotoNote(imageName: string, words: string): string {
  const w = words.trim();
  return whiteboardPhotoNote(imageName) + (w ? `\n\n${PHOTO_CORRECTIONS_HEADING}\n${w}` : "");
}

/** Is this a whiteboard-photo prompt (it begins with the photo note)? */
export function isWhiteboardPhotoPrompt(prompt: string): boolean {
  return prompt.trimStart().startsWith(WHITEBOARD_PHOTO_OPENING);
}

/** A photo prompt taken apart again — the image's name and the person's own words — for a retry. */
export function photoNoteParts(prompt: string): { imageName: string; words: string } | null {
  const p = prompt.trim();
  if (!isWhiteboardPhotoPrompt(p)) return null;
  const m = p.slice(WHITEBOARD_PHOTO_OPENING.length).match(/^ \(([^()\n]+)\)\./);
  const at = p.indexOf(PHOTO_CORRECTIONS_HEADING);
  return {
    imageName: m ? m[1] : "",
    words: at >= 0 ? p.slice(at + PHOTO_CORRECTIONS_HEADING.length).trim() : "",
  };
}
