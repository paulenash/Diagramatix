/**
 * One place that orders a mutating route's checks: auth → org/project access →
 * read-only impersonation → (optional) subscription feature gate.
 *
 * ARCH-01: the read-only-impersonation check was opt-in, and absent from 149 of
 * the 245 mutating route handlers. That is not 149 oversights — it is one
 * missing primitive, so every new route re-flipped the coin. The Risk & Control
 * tree already had the right shape in `riskControls/routeAuth.ts`; this is that
 * shape with the feature slug lifted out into a parameter, and `routeAuth.ts`
 * now delegates to it so there is a single implementation.
 *
 * Why the order matters. `isReadOnlyImpersonation` must be answered BEFORE the
 * handler does any work, and the body must not be read before authentication
 * (SEC-33) — a 401 that arrives after the server has buffered a multipart
 * upload is a free memory lever for an anonymous caller.
 *
 * What read-only impersonation means: a SuperAdmin viewing another user's
 * account in "view" mode (see `app/lib/superuser.ts`). Writes in that mode
 * would be attributed to the impersonated user, which is the one thing the
 * mode exists to prevent — hence 403, never a silent no-op.
 *
 * `tests/config/mutating-route-guard.test.ts` holds the ratchet: a route that
 * mutates and neither guards nor appears on the reviewed exemption list fails
 * the suite.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import {
  requireOrgAdminFor,
  requireProjectAccess,
  OrgContextError,
  type ProjectAccessRole,
} from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";

export type SessionLike = Parameters<typeof isReadOnlyImpersonation>[0];

/** Either a response to return immediately, or the context the handler needs. */
export type RouteGuard<T> = { error: NextResponse; ctx: null } | { error: null; ctx: T };

export const READ_ONLY_MESSAGE = "Read-only: viewing another user";

/** The 403 every read-only-impersonation refusal returns, worded identically. */
export function readOnlyResponse(): NextResponse {
  return NextResponse.json({ error: READ_ONLY_MESSAGE }, { status: 403 });
}

function fromOrgContextError(err: unknown): { error: NextResponse; ctx: null } {
  if (err instanceof OrgContextError) {
    return { error: NextResponse.json({ error: err.message }, { status: err.status }), ctx: null };
  }
  throw err;
}

/**
 * The bare check, for a route that resolves its own scope (a SOP id, a bundle)
 * and so cannot use the project/org wrappers below. Returns the 403 to return,
 * or null to carry on. Call it before touching the request body.
 */
export async function blockReadOnlyImpersonation(session: SessionLike): Promise<NextResponse | null> {
  return isReadOnlyImpersonation(session, await cookies()) ? readOnlyResponse() : null;
}

interface GuardOpts {
  /** Does this handler write? A mutating handler blocks read-only impersonation. */
  mutate: boolean;
  /** Subscription feature slug to gate the mutation behind, e.g. "riskControl". */
  feature?: string;
}

/** SuperAdmin, or an Owner/Admin of the org. */
export async function guardOrgRoute(
  orgId: string,
  { mutate, feature }: GuardOpts,
): Promise<RouteGuard<{ session: SessionLike; userId: string; isSuperAdmin: boolean }>> {
  const session = await auth();
  const jar = await cookies();
  if (mutate && isReadOnlyImpersonation(session, jar)) return { error: readOnlyResponse(), ctx: null };
  try {
    const { userId, isSuperAdmin } = await requireOrgAdminFor(session, jar, orgId);
    if (mutate && feature) {
      const gated = await gateFeature(userId, feature);
      if (gated) return { error: gated, ctx: null };
    }
    return { error: null, ctx: { session, userId, isSuperAdmin } };
  } catch (err) {
    return fromOrgContextError(err);
  }
}

/** Project access at `role` or better. */
export async function guardProjectRoute(
  projectId: string,
  role: ProjectAccessRole,
  { mutate, feature }: GuardOpts,
): Promise<RouteGuard<{ session: SessionLike; projectOrgId: string; ownerUserId: string; role: ProjectAccessRole }>> {
  const session = await auth();
  const jar = await cookies();
  if (mutate && isReadOnlyImpersonation(session, jar)) return { error: readOnlyResponse(), ctx: null };
  try {
    const access = await requireProjectAccess(session, jar, projectId, role);
    if (mutate && feature) {
      const gated = await gateFeature(session?.user?.id ?? "", feature);
      if (gated) return { error: gated, ctx: null };
    }
    return { error: null, ctx: { session, ...access } };
  } catch (err) {
    return fromOrgContextError(err);
  }
}
