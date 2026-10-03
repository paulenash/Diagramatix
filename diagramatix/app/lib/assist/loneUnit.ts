/**
 * A lone "pixels" — the unit said AFTER a pause, as its own fragment.
 *
 * Paul, 2026-10-04: "move selected pool's bottom boundary up 100" works; adding "pixels" on the end causes an error.
 * The parser reads "up 100 pixels" fine. What happens is speech: "… up 100" is a whole command (a bare number is pixels),
 * so it runs; then "pixels" arrives as a fragment of its own and means nothing. Pixels is the default unit, so the
 * command has already done exactly what was asked — the straggler is accepted, not rejected.
 *
 * Only the pixel words. "steps" and "tasks" CHANGE the meaning of the number, so a late one is not swallowed.
 */
export function isLonePixelWord(text: string): boolean {
  return /^(?:pixels?|px|pix)[\s.,!?]*$/i.test(String(text ?? "").trim());
}
