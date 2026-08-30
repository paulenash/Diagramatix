/**
 * The Partner API's shared vocabulary.
 *
 * Kept apart from the route files because the PHASE decides retention, and a
 * retention rule expressed in three places is a retention rule that will
 * disagree with itself.
 */

/** Which rollout phase a key is in. Retention is a property of this, not of a
 *  boolean somebody has to remember to unset.
 *
 *  - `internal` — our own test harness. Inputs live in the HarnessCase corpus,
 *    which is our material and persists.
 *  - `testing`  — a partner's integration window. Their documents and request
 *    bodies ARE kept, so a failure can be debugged, but only until
 *    `captureUntil`, and going live purges them.
 *  - `live`     — metadata only. Sizes, hashes, status, timing, error code:
 *    enough to see THAT something failed and how often, never what was in it.
 */
export type ApiKeyPhase = "internal" | "testing" | "live";

export const API_KEY_PHASES: readonly ApiKeyPhase[] = ["internal", "testing", "live"] as const;

export function isApiKeyPhase(v: unknown): v is ApiKeyPhase {
  return typeof v === "string" && (API_KEY_PHASES as readonly string[]).includes(v);
}

/** The furthest out a `testing` window may be set. A disclosed, time-boxed
 *  agreement stops being either of those things if it can be open-ended. */
export const MAX_CAPTURE_DAYS = 90;

/** Does this key keep request bodies and the uploaded document right now?
 *  `testing` only, and only until the window closes — an expired window is
 *  treated exactly like `live`, so forgetting to move a key degrades safely. */
export function isCapturing(
  key: { phase: string; captureUntil: Date | null },
  now: Date = new Date(),
): boolean {
  if (key.phase !== "testing") return false;
  return !!key.captureUntil && key.captureUntil.getTime() > now.getTime();
}

/** Scopes a key can hold. One for now; the column is a list so adding a second
 *  capability later does not need a migration. */
export const SCOPE_PROCESS_MAPPING = "process-mapping";

/** The request envelope is truncated — a truncated PDF is useless, so the
 *  document itself is stored whole on the job instead of twice here. */
export const BODY_CAPTURE_LIMIT = 2048;
