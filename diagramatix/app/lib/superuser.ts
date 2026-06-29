/** Emails permitted to access admin functions */
export const SUPERUSER_EMAILS = new Set([
  "paul@nashcc.com.au",
  "paul@diagramatix.com.au",
  "greg.nash@getai.com.au",
]);

/** Cookie name used to store the impersonation target userId */
export const IMPERSONATE_COOKIE = "dgx_view_as";

/**
 * Cookie that controls the *mode* of impersonation:
 *   "view" (default) — read-only, mutations blocked by API routes
 *   "edit"            — full edit access, for support / repair work
 * Only meaningful when IMPERSONATE_COOKIE is also set.
 */
export const IMPERSONATE_MODE_COOKIE = "dgx_view_as_mode";
export type ImpersonationMode = "view" | "edit";

/** Minimal cookie store interface — compatible with whatever cookies() returns */
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

/** Check whether the authenticated session belongs to a superuser.
 *  Case-INSENSITIVE: SUPERUSER_EMAILS are lowercase and the session email is
 *  lowercased before the lookup, so a superuser whose stored email differs only
 *  in casing (registration does not normalise it) is still recognised. */
export function isSuperuser(session: { user?: { email?: string | null } } | null): boolean {
  const email = session?.user?.email;
  return !!email && SUPERUSER_EMAILS.has(email.toLowerCase());
}

/** If the superuser is impersonating another user, return that user's ID; otherwise null */
export function getViewAsUserId(
  session: { user?: { id?: string; email?: string | null } } | null,
  cookieStore: CookieStore,
): string | null {
  if (!isSuperuser(session)) return null;
  const val = cookieStore.get(IMPERSONATE_COOKIE)?.value;
  if (!val) return null;
  // Don't impersonate yourself
  if (val === session?.user?.id) return null;
  return val;
}

/** Return the effective userId for data queries — impersonation target or own id */
export function getEffectiveUserId(
  session: { user?: { id?: string; email?: string | null } } | null,
  cookieStore: CookieStore,
): string {
  return getViewAsUserId(session, cookieStore) ?? session?.user?.id ?? "";
}

/** Whether the current request is in impersonation mode */
export function isImpersonating(
  session: { user?: { id?: string; email?: string | null } } | null,
  cookieStore: CookieStore,
): boolean {
  return getViewAsUserId(session, cookieStore) !== null;
}

/** Read the impersonation mode cookie ("view" by default). */
export function getImpersonationMode(cookieStore: CookieStore): ImpersonationMode {
  return cookieStore.get(IMPERSONATE_MODE_COOKIE)?.value === "edit" ? "edit" : "view";
}

/**
 * Should this request be treated as read-only? True only when we're
 * impersonating AND the mode is "view". In "edit" mode the admin can
 * mutate the target user's data (for support / repair).
 */
export function isReadOnlyImpersonation(
  session: { user?: { id?: string; email?: string | null } } | null,
  cookieStore: CookieStore,
): boolean {
  if (!isImpersonating(session, cookieStore)) return false;
  return getImpersonationMode(cookieStore) === "view";
}
