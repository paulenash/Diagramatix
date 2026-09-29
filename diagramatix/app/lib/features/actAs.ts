/**
 * "Act as level X" — a SuperAdmin previews the app as a customer on a given
 * subscription level, and the SERVER evaluates as that level: the feature
 * matrix, every numeric limit, the usage snapshot and the editor's element cap.
 * (Until 2026-09-30 the view-mode switcher was cosmetic: a hard-coded table
 * that hid buttons while every API gate still passed as a SuperAdmin.)
 *
 * The switch is the existing `dgx_sa_mode` cookie (app/hooks/useSuperAdminChrome.ts):
 * a tier name means "act as that level". The cookie is writable by anyone, so it
 * is only ever honoured for a user who IS a SuperAdmin (the caller checks) — for
 * everyone else it is ignored.
 *
 * While acting, the SuperAdmin bypass is OFF: limits bite, hidden features stay
 * hidden, and usage is really counted (so a limit can be hit and tested).
 */

export const SA_MODE_COOKIE = "dgx_sa_mode";

/** The subscription levels a SuperAdmin can act as (their ids are the same as the view-mode names). */
export const ACT_AS_LEVELS = ["free", "introductory", "professional", "expert", "enterprise"] as const;
export type ActAsLevel = (typeof ACT_AS_LEVELS)[number];

/** Pure: the level a view-mode cookie value means, or null for superadmin / orgadmin / absent / anything else. */
export function actAsLevelFromMode(mode: string | null | undefined): ActAsLevel | null {
  return (ACT_AS_LEVELS as readonly string[]).includes(mode ?? "") ? (mode as ActAsLevel) : null;
}

/**
 * The level the CURRENT REQUEST is acting as, from its cookie — null outside a request
 * (a background job, a test) or when no tier view is selected. The caller must have
 * established that the user in question is a SuperAdmin.
 */
export async function currentActAsLevel(): Promise<ActAsLevel | null> {
  try {
    const { cookies } = await import("next/headers");
    return actAsLevelFromMode((await cookies()).get(SA_MODE_COOKIE)?.value);
  } catch {
    return null;
  }
}
