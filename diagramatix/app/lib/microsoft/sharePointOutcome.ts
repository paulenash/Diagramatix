/**
 * How a SharePoint request that did not succeed is reported — on the server
 * (what the route answers) and in the browser (what the user is shown). One
 * place for both, so the two sides cannot drift.
 *
 * Paul, 2026-09-22: "trying to set a Sharepoint link on a Data Object should
 * always fail gracefully if user not logged in to a Microsoft account,
 * currently it can kill the app."
 *
 * Three things could take the editor down:
 *
 *   • The picker's "Connect" button sent the WHOLE editor to Microsoft's
 *     sign-in. Someone not signed in to Microsoft — or whose sign-in failed —
 *     was left on Microsoft's page with the diagram gone. Connecting now happens
 *     in a new tab; the editor never leaves.
 *   • A Microsoft token the app still thought was valid but Microsoft refused
 *     (signed out, password changed, consent revoked) came back as a raw 401
 *     with Graph's own message, instead of the "connect your account" prompt.
 *   • A Graph error with no usable HTTP status (a network failure reports -1)
 *     was passed straight to the response, which throws — so the route failed
 *     with no answer at all.
 *
 * Pure: no server or browser imports.
 */

/** The code the routes attach when the user has no working Microsoft sign-in. */
export const MS_NOT_CONNECTED = "ms-not-connected";

export const MS_NOT_CONNECTED_MESSAGE = "Microsoft account not connected";

export type SharePointOutcome =
  /** No Microsoft sign-in, or Microsoft refused it — offer to (re)connect. */
  | { kind: "not-connected"; message: string }
  /** The Diagramatix session itself has ended. */
  | { kind: "signed-out"; message: string }
  /** SharePoint is off for this org or not configured — nothing to connect. */
  | { kind: "unavailable"; message: string }
  /** Anything else — show the message, keep the picker open. */
  | { kind: "error"; message: string };

/**
 * A usable HTTP error status for a Graph failure. Graph reports its own
 * status on `statusCode`; a network failure reports -1, and anything outside
 * 400–599 would make the response constructor throw.
 */
export function graphErrorStatus(err: unknown): number {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" && Number.isInteger(code) && code >= 400 && code <= 599 ? code : 502;
}

/**
 * What a route answers for a Graph failure. A 401 from Graph means the token
 * was refused — to the user that is the same as not being connected, so it is
 * answered the same way and the picker offers to reconnect.
 */
export function graphErrorBody(err: unknown, fallback: string): { status: number; body: { error: string; code?: string } } {
  const status = graphErrorStatus(err);
  if (status === 401) {
    return {
      status: 403,
      body: { error: "Your Microsoft sign-in has expired or was revoked. Reconnect your Microsoft account.", code: MS_NOT_CONNECTED },
    };
  }
  const message = (err as { message?: unknown } | null)?.message;
  return { status, body: { error: typeof message === "string" && message ? message : fallback } };
}

/** The body a route sends when the user has no working Microsoft token. */
export function notConnectedBody(): { error: string; code: string } {
  return { error: MS_NOT_CONNECTED_MESSAGE, code: MS_NOT_CONNECTED };
}

/**
 * Classify a failed SharePoint response for the user. `body` is whatever JSON
 * came back, or null when there was none.
 */
export function classifySharePointFailure(status: number, body: unknown): SharePointOutcome {
  const b = (body && typeof body === "object" ? body : {}) as { error?: unknown; code?: unknown };
  const message = typeof b.error === "string" && b.error ? b.error : "";
  if (b.code === MS_NOT_CONNECTED || (status === 403 && message === MS_NOT_CONNECTED_MESSAGE)) {
    return { kind: "not-connected", message: message || MS_NOT_CONNECTED_MESSAGE };
  }
  if (status === 401) {
    return { kind: "signed-out", message: "Your Diagramatix session has ended. Sign in again in another tab, then press Retry." };
  }
  // Every other 403 is the org policy gate, whose message says why.
  if (status === 403) {
    return { kind: "unavailable", message: message || "SharePoint isn't available for your organisation." };
  }
  return { kind: "error", message: message || `SharePoint request failed (${status}).` };
}

/**
 * A list from a SharePoint response, or an empty one. The picker renders these
 * with `.map`; anything that is not an array would throw during render and
 * take the whole editor with it.
 */
export function asList<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

/**
 * Where "Connect" goes. Opened in a NEW tab so the editor is never navigated
 * away; after Microsoft sends the user back, that tab lands on a page that says
 * it can be closed.
 */
export function connectUrl(origin: string): string {
  return "/api/microsoft/connect?returnTo=" + encodeURIComponent(`${origin}/dashboard/microsoft-connected`);
}
