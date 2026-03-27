/** The only email permitted to impersonate other users */
export const SUPERUSER_EMAIL = "paul@nashcc.com.au";

/** Cookie name used to store the impersonation target userId */
export const IMPERSONATE_COOKIE = "dgx_view_as";

/** Minimal cookie store interface — compatible with whatever cookies() returns */
interface CookieStore {
  get(name: string): { value: string } | undefined;
}

/** Check whether the authenticated session belongs to the superuser */
export function isSuperuser(session: { user?: { email?: string | null } } | null): boolean {
  return session?.user?.email === SUPERUSER_EMAIL;
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
