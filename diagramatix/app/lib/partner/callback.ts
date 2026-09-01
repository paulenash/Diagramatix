/**
 * Completion callback (v2/5) — one POST of the finished result to a URL the
 * caller supplied.
 *
 * Asked for in the review of 2026-09-01: "you can't push?". It is an ADDITION to
 * polling, never a replacement, and that distinction is the whole design. The job
 * stays exactly as pollable as it was, so a callback that never arrives — a
 * network blip, a deploy at their end, a typo in the URL — costs nothing but the
 * convenience. Nothing here may throw into the worker's dangling promise, and
 * nothing here may make a run fail: the work succeeded, and a delivery problem is
 * not a generation problem.
 *
 * Worth being clear about what this does NOT buy. The user-visible timing is
 * identical either way, because a caller polling every five seconds learns the
 * answer within five seconds of it existing. A push is fewer requests, not a
 * faster result — and the request came from a belief that it would feel quicker.
 */

/** Long enough for a slow endpoint, short enough not to hold a worker. */
const TIMEOUT_MS = 10_000;
/** Two attempts. Enough for a blip; not a retry queue, which we do not have. */
const ATTEMPTS = 2;

export interface CallbackOutcome {
  delivered: boolean;
  status?: number;
  error?: string;
  attempts: number;
}

/**
 * POST `payload` to `url`. Never throws.
 *
 * The body is the same shape a poll would have returned, so a caller can share
 * one handler between the two paths rather than writing the result twice.
 */
export async function deliverCallback(
  url: string,
  payload: unknown,
  opts: { jobId: string; ref: string },
): Promise<CallbackOutcome> {
  const body = JSON.stringify(payload);
  let lastError = "";
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const timer = AbortSignal.timeout(TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // So the receiver can correlate with the run, and with our logs, from
          // the headers alone — without parsing a body it may reject.
          "X-Diagramatix-Job-Id": opts.jobId,
          "X-Diagramatix-Request-Id": opts.ref,
          "User-Agent": "Diagramatix-Process-API/1.0 (+callback)",
        },
        body,
        signal: timer,
        redirect: "error",      // a redirected POST is not what anybody meant
      });
      lastStatus = res.status;
      if (res.ok) return { delivered: true, status: res.status, attempts: attempt };
      lastError = `HTTP ${res.status}`;
      // A 4xx is the receiver saying "not this, and not again" — retrying a
      // rejected payload just sends the same thing twice.
      if (res.status >= 400 && res.status < 500) break;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }

  console.warn(`[partner] callback for job ${opts.jobId} not delivered: ${lastError}`);
  return { delivered: false, status: lastStatus, error: lastError, attempts: ATTEMPTS };
}
