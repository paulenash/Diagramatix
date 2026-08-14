/**
 * Boot-time environment validation (CFG-02, CFG-04).
 *
 * Security-critical secrets were read with a non-null assertion (`process.env.X!`)
 * scattered across the codebase, so a missing or placeholder value surfaced as a
 * confusing runtime crash deep inside a request — or, worse for `AUTH_SECRET`,
 * silently "worked" with a forgeable session secret. This runs once at server
 * start (from `instrumentation.ts`) and fails FAST with a clear message instead.
 *
 * Pure + side-effect-free so it can be unit-tested: `checkEnv(env)` returns the
 * problems; `assertEnv()` reads `process.env`, logs, and throws on a hard error.
 */

/** The literal placeholders shipped in `.env.example`. A real deployment must
 *  replace these — if one reaches a running server it is a misconfiguration, not
 *  a value. */
const PLACEHOLDERS = new Set<string>([
  "replace-with-openssl-rand-base64-32-output",
  "replace-with-entra-client-secret-value",
  "your-secret-here",
  "changeme",
  "secret",
]);

export interface EnvProblem {
  key: string;
  level: "error" | "warn";
  message: string;
}

/**
 * Validate an environment map. `error`-level problems must stop the server;
 * `warn`-level ones are logged but tolerated (e.g. an optional integration whose
 * secret is absent). Kept declarative so the required set is obvious.
 */
export function checkEnv(env: Record<string, string | undefined>): EnvProblem[] {
  const problems: EnvProblem[] = [];
  const val = (k: string) => (env[k] ?? "").trim();

  // ── AUTH_SECRET (CFG-02) — the JWT signing secret. A weak/placeholder value
  // lets anyone forge a session, so this is a hard failure. ──
  const secret = val("AUTH_SECRET");
  if (!secret) {
    problems.push({ key: "AUTH_SECRET", level: "error", message: "is missing — generate one with `openssl rand -base64 32`" });
  } else if (PLACEHOLDERS.has(secret)) {
    problems.push({ key: "AUTH_SECRET", level: "error", message: "is still the .env.example placeholder — anyone can forge a session; set a real value" });
  } else if (secret.length < 32) {
    problems.push({ key: "AUTH_SECRET", level: "error", message: `is too short (${secret.length} chars) — use at least 32 (\`openssl rand -base64 32\`)` });
  }

  // ── DATABASE_URL — no DB, no app. Hard failure with a clear message rather
  // than a pool error deep in the first query. ──
  if (!val("DATABASE_URL")) {
    problems.push({ key: "DATABASE_URL", level: "error", message: "is missing — the Postgres connection string is required" });
  }

  // ── AUTH_TRUST_HOST — required by Auth.js v5 behind a proxy; its absence
  // breaks callback URLs in a way that's hard to diagnose. Warn, don't block. ──
  if (!val("AUTH_TRUST_HOST")) {
    problems.push({ key: "AUTH_TRUST_HOST", level: "warn", message: "is not set — Auth.js may build wrong callback URLs behind a proxy (set AUTH_TRUST_HOST=true)" });
  }

  // ── Entra SSO is optional, but half-configured is a foot-gun: if one of the
  // pair is present, both must be. ──
  const hasId = !!val("AZURE_CLIENT_ID");
  const hasSecret = !!val("AZURE_CLIENT_SECRET");
  if (hasId !== hasSecret) {
    problems.push({ key: "AZURE_CLIENT_*", level: "error", message: "is half-configured — set BOTH AZURE_CLIENT_ID and AZURE_CLIENT_SECRET, or neither" });
  } else if (hasSecret && PLACEHOLDERS.has(val("AZURE_CLIENT_SECRET"))) {
    problems.push({ key: "AZURE_CLIENT_SECRET", level: "error", message: "is still the .env.example placeholder" });
  }

  return problems;
}

/**
 * Read `process.env`, log every problem, and throw on any `error`-level one.
 * Called from `instrumentation.ts` at server boot (Node runtime only).
 *
 * `skipInDev` (default true) downgrades hard errors to warnings when NODE_ENV is
 * not "production", so a developer running locally with a scratch `.env` isn't
 * blocked — the guard's real job is to stop a misconfigured PRODUCTION boot.
 */
export function assertEnv(env: Record<string, string | undefined> = process.env, opts: { skipInDev?: boolean } = {}): void {
  const skipInDev = opts.skipInDev ?? true;
  const isProd = (env.NODE_ENV ?? "") === "production";
  const problems = checkEnv(env);
  if (problems.length === 0) return;

  const errors = problems.filter((p) => p.level === "error");
  const warns = problems.filter((p) => p.level === "warn");
  for (const w of warns) console.warn(`[env] ${w.key} ${w.message}`);

  if (errors.length === 0) return;
  const lines = errors.map((e) => `  • ${e.key} ${e.message}`).join("\n");

  if (!isProd && skipInDev) {
    console.warn(`[env] configuration problems (tolerated outside production):\n${lines}`);
    return;
  }
  throw new Error(`[env] refusing to start — fix these environment problems:\n${lines}`);
}
