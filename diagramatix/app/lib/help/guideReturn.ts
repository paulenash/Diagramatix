/**
 * "Go to the User Guide and come back to exactly where I was."
 *
 * Paul, 2026-09-13: "Always go back to screen and state of original invocation
 * when going to the User Guide."
 *
 * The guide already understood `?from=<path>` (see `app/(dashboard)/help/page.tsx`),
 * and for an ordinary page a path IS the state. It is not enough for the four
 * full-screen consoles — Simulator, Miner, Risk & Control, AI Generate. Each is
 * an OVERLAY rendered over a host page rather than a route of its own, so its
 * open-ness lives in React state that the host loses the moment you navigate
 * away. `from=/diagram/abc` returned you to the diagram with the console shut,
 * which is the screen you invoked from but not the state.
 *
 * So the return path carries a reopen key, and the host reads it back. The key
 * names the overlay, not the component, because the same overlay is hosted from
 * three different pages (the Simulator opens from the Dashboard, a Project and a
 * Diagram) and each has to honour the same token.
 *
 * Pure — no React, no "use client" — so a server component, a client component
 * and a test can all use it.
 */

import { safeInternalPath } from "@/app/lib/safeRedirect";

/** Query parameter the host reads to decide which overlay to re-open. */
export const REOPEN_PARAM = "reopen";

/**
 * The overlays that can be returned to. A closed set rather than free text: a
 * typo in a key would silently mean "open nothing", which looks exactly like
 * the bug this exists to fix.
 */
export type ReopenKey = "simulator" | "miner" | "risk-control" | "ai-generate";

const KEYS: ReadonlySet<string> = new Set<ReopenKey>([
  "simulator", "miner", "risk-control", "ai-generate",
]);

/** The reopen key in a query string, or null when it is absent or unknown. */
export function reopenKeyOf(value: string | null | undefined): ReopenKey | null {
  return value && KEYS.has(value) ? value as ReopenKey : null;
}

/**
 * Build the href for a User Guide link that can get the reader back.
 *
 * `pathname` is the host page. `reopen` is the overlay to restore on return —
 * omit it from an ordinary page, where the path alone is the state.
 */
export function guideHref(opts: {
  /** Guide chapter slug, e.g. "ai-generate". Omitted opens the first chapter. */
  chapter?: string;
  /** The invoking page's path (no query string needed). */
  pathname: string;
  reopen?: ReopenKey;
  /** Extra return-path params, e.g. a project id the host needs. */
  returnParams?: Record<string, string>;
}): string {
  const { chapter, pathname, reopen, returnParams } = opts;
  // SEC-15, on the WAY OUT as well as the way in. `startsWith("/")` was the
  // naive guard this exact helper exists to avoid: it accepts `//evil.test` and
  // `/\evil.test`, which a browser reads as cross-origin. The guide re-validates
  // `from` when it reads it, so this is defence in depth — but a builder that
  // can manufacture an off-site link is a bad thing to leave lying around, and
  // nothing here is expensive enough to justify the risk.
  const base = safeInternalPath(pathname) ?? "/dashboard";
  const rp = new URLSearchParams(returnParams ?? {});
  if (reopen) rp.set(REOPEN_PARAM, reopen);
  const qs = rp.toString();
  const from = qs ? `${base}?${qs}` : base;
  const guide = new URLSearchParams();
  if (chapter) guide.set("c", chapter);
  guide.set("from", from);
  return `/help?${guide.toString()}`;
}

/**
 * Strip the reopen token from the current URL once it has been acted on.
 *
 * Without this the token survives every later navigation within the page, so a
 * reload — or a Back that lands here again — silently re-opens a console the
 * user has since closed. Returns the path to replace with, or null when there
 * was nothing to strip.
 */
export function urlWithoutReopen(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search);
  if (!params.has(REOPEN_PARAM)) return null;
  params.delete(REOPEN_PARAM);
  for (const p of RETURN_PARAMS) params.delete(p);
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * Params a host may need to rebuild an overlay's context, cleared alongside the
 * token. The Dashboard hosts the Simulator and the Miner for a PROJECT, and
 * holds that project as an object rather than a boolean — so returning there
 * needs the project's identity, which the path alone does not carry.
 */
export const RETURN_PID = "rpid";
export const RETURN_PNAME = "rpname";
const RETURN_PARAMS = [RETURN_PID, RETURN_PNAME] as const;

/** The project a return trip should restore, or null when none was carried. */
export function returnProjectOf(
  get: (key: string) => string | null,
): { id: string; name: string } | null {
  const id = get(RETURN_PID);
  return id ? { id, name: get(RETURN_PNAME) ?? "" } : null;
}
