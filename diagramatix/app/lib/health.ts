/**
 * Readiness, as one answer: is the app up AND can it reach its database?
 *
 * Served by `GET /api/health` and used two ways —
 *  - App Service's health check path. With no path set, Azure rotated traffic
 *    to a freshly deployed container as soon as it was RUNNING, and the first
 *    real request paid Next's cold start plus the first DB connection (Paul,
 *    2026-09-14: "Why do hard refreshes take so long after a deploy?"). With
 *    this path, "healthy" means the DB pool has connected and a query has run.
 *  - The deploy smoke test, which also needs to know WHICH build is answering:
 *    the old container returns 200 just as happily as the new one, so the
 *    report carries the commit the image was built from.
 *
 * Pure: the DB ping is injected so both outcomes are testable without a DB.
 */
export interface HealthReport {
  ok: boolean;
  db: "ok" | "error";
  /** Git commit the running image was built from ("" when not built by CI). */
  commit: string;
  uptimeSec: number;
  error?: string;
}

export interface HealthOptions {
  commit?: string;
  uptimeSec?: number;
  /** A ping that takes longer than this is reported as unhealthy — a hung
   *  connection must not hold the probe open indefinitely. */
  timeoutMs?: number;
}

export async function checkHealth(
  ping: () => Promise<unknown>,
  opts: HealthOptions = {},
): Promise<{ status: 200 | 503; body: HealthReport }> {
  const commit = opts.commit ?? "";
  const uptimeSec = Math.round(opts.uptimeSec ?? 0);
  const timeoutMs = opts.timeoutMs ?? 5_000;

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`DB ping timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    await Promise.race([ping(), timeout]);
    return { status: 200, body: { ok: true, db: "ok", commit, uptimeSec } };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { status: 503, body: { ok: false, db: "error", commit, uptimeSec, error } };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
