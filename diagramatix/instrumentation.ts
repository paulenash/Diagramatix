/**
 * Next.js instrumentation hook — runs once at server startup, in both the Node
 * and Edge runtimes. We validate the environment here (CFG-02, CFG-04) so a
 * misconfigured PRODUCTION boot fails fast with a clear message instead of a
 * confusing runtime crash — or, for AUTH_SECRET, a silently forgeable session.
 *
 * Only the Node runtime has the full `process.env`, so the check runs there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("@/app/lib/env");
    assertEnv();
  }
}
