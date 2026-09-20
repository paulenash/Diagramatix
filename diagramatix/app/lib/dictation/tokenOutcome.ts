/**
 * B8 — what a dictation-token response means, decided in one place.
 *
 * THE DEFECT. `startDictation` did this:
 *
 *     const r = await fetch("/api/ai/dictation/token", { method: "POST" });
 *     if (r.ok) { token = …; }
 *     …
 *     const engine = token ? "deepgram" : "browser";
 *
 * Every non-ok status collapsed into the same "no token" branch, so an
 * organisation that has deliberately turned **off** cloud voice transcription
 * got the browser's speech engine instead — silently. The policy was not
 * enforced, it was ignored with a shrug, and the user was told nothing. That
 * mattered less while the feature was SuperAdmin-only; it matters now that
 * Voice Assist is live to Expert-and-above customers.
 *
 * The three cases are genuinely different and only one of them is a fallback:
 *
 *   403  The org said no. That is a DECISION, not an outage. Refuse — starting
 *        a different speech engine sends the same audio to a different place
 *        and defeats the policy just as thoroughly.
 *   503  The server has no Deepgram key configured. Nobody decided anything;
 *        the browser engine is a genuine, weaker substitute. Fall back, and
 *        SAY SO rather than letting the user assume they have the good one.
 *   else A network error, a 401, an unexpected status. Fall back and say so.
 *
 * Pure, so the distinction can be tested without a network.
 */

export type TokenOutcome =
  /** Cloud transcription is available — use it. */
  | { kind: "cloud"; token: string; scheme: string }
  /** No cloud, but the browser engine is a fair substitute. `notice` explains why. */
  | { kind: "fallback"; notice: string }
  /** Voice must not start at all. `message` is shown to the user. */
  | { kind: "refused"; message: string };

/** The standing wording when an org has turned voice transcription off. */
export const VOICE_POLICY_MESSAGE =
  "Voice transcription is turned off by your organisation's policy. You can still type commands.";

const NOT_CONFIGURED =
  "Cloud transcription isn't configured, so this is your browser's speech engine — less accurate, and not available in every browser.";

const UNAVAILABLE =
  "Cloud transcription is unavailable, so this is your browser's speech engine — less accurate, and not available in every browser.";

/**
 * Decide from the token endpoint's status and parsed body.
 *
 * `body` is whatever the response JSON was, or null when it could not be read;
 * a 403 carries the server's own message, which is more specific than ours
 * when a future policy adds a reason.
 */
export function tokenOutcome(
  status: number | null,
  body: { token?: unknown; scheme?: unknown; error?: unknown } | null,
): TokenOutcome {
  if (status === 403) {
    const served = typeof body?.error === "string" ? body.error.trim() : "";
    // Only take the server's wording when it says something; an empty or
    // generic "Forbidden" is worse than the sentence we wrote for this case.
    const useServed = served && !/^forbidden$/i.test(served);
    return { kind: "refused", message: useServed ? served : VOICE_POLICY_MESSAGE };
  }

  if (status && status >= 200 && status < 300) {
    const token = typeof body?.token === "string" ? body.token : "";
    if (token) {
      const scheme = typeof body?.scheme === "string" && body.scheme ? body.scheme : "token";
      return { kind: "cloud", token, scheme };
    }
    // 200 with no token is a server bug, not a policy decision — the browser
    // engine is still better than nothing, but say that something is wrong.
    return { kind: "fallback", notice: UNAVAILABLE };
  }

  if (status === 503) return { kind: "fallback", notice: NOT_CONFIGURED };

  return { kind: "fallback", notice: UNAVAILABLE };
}
