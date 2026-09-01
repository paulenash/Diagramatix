/**
 * A place for a test callback to land.
 *
 * The callback is the one v2 feature that cannot be seen working from either
 * end on its own: the API posts outward, and without somewhere to post TO there
 * is nothing to look at. So the harness points a run at our own receiver and this
 * holds what arrived, for the screen to show.
 *
 * In memory on purpose. This is test scaffolding, not a record: it is worthless
 * five minutes later, it must not accumulate, and a partner's real callback goes
 * to their own endpoint and never touches this. It resets on deploy, which for
 * something whose whole life is "did the one I just fired arrive?" is correct.
 */

export interface ReceivedCallback {
  jobId: string;
  at: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Bounded so a stuck loop cannot eat the process. Oldest out first. */
const MAX = 50;
const inbox = new Map<string, ReceivedCallback>();

export function recordCallback(c: ReceivedCallback): void {
  inbox.set(c.jobId, c);
  while (inbox.size > MAX) {
    const oldest = inbox.keys().next().value;
    if (oldest === undefined) break;
    inbox.delete(oldest);
  }
}

export function takeCallback(jobId: string): ReceivedCallback | null {
  return inbox.get(jobId) ?? null;
}

/**
 * Take a delivery. Lives here rather than in the route so it can be tested
 * without dragging next-auth into the test environment — and because the rule
 * that keeps an unauthenticated endpoint safe deserves to sit with the store it
 * protects, not in a handler.
 *
 * Records ONLY for a job that exists. Returns quietly either way: this is
 * pretending to be somebody's webhook, and a webhook that argues about ids is not
 * a useful thing to test against. What matters is that an unknown id stores
 * nothing, so nobody who finds the endpoint can use it as free memory.
 */
export async function acceptDelivery(
  req: Request,
  jobExists: (id: string) => Promise<boolean>,
): Promise<void> {
  const jobId = req.headers.get("x-diagramatix-job-id")?.trim() ?? "";
  if (!jobId) return;
  if (!(await jobExists(jobId))) return;

  const headers: Record<string, string> = {};
  for (const [k, v] of req.headers.entries()) {
    const lk = k.toLowerCase();
    if (lk === "authorization" || lk === "x-api-key") continue;   // never stored
    headers[k] = v;
  }
  const body = await req.json().catch(() => null);
  recordCallback({ jobId, at: new Date().toISOString(), headers, body });
}
