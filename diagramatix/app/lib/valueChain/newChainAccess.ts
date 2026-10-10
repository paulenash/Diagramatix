import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
import { resolveEffectiveLevelId } from "@/app/lib/features/effectiveLevel";
import { atLeastTier } from "@/app/lib/features/tierRank";
import { isOrgAdminRole } from "@/app/lib/auth/orgAdminRole";

/**
 * Who may use "Create a New Value Chain" (Expert and above; Paul, 2026-10-10). Every route under /api/repository/new-chain calls this first.
 *
 * Three layers, and all must pass:
 *   1. the Feature Availability grid says the feature is available to this user's level (gateFeature) — the grid is the authority a SuperAdmin
 *      edits;
 *   2. a FLOOR of Expert in code. A newly registered feature whose grid cells have not been seeded yet FAILS OPEN (features/availability.ts),
 *      which for this feature would mean every Free user could spend the Org's AI allowance. Until the seed has been run the floor is what
 *      keeps Paul's rule true; it is removed in the release slice once the grid is authoritative;
 *   3. the Org's own switches: AI allowed, a role that may write, not a read-only impersonation.
 *
 * A SuperAdmin passes 1 and 2 (they bypass the grid and the floor, as everywhere) but still needs an Org to create into.
 */
export const CREATE_VALUE_CHAIN_FEATURE = "create-value-chain";

export type NewChainAccess =
  | { ok: true; userId: string; userName: string; orgId: string; isSuper: boolean; isOrgAdmin: boolean }
  | { ok: false; response: NextResponse };

const refuse = (error: string, status: number): { ok: false; response: NextResponse } => ({ ok: false, response: NextResponse.json({ error }, { status }) });

export async function requireNewChainAccess(session: Session | null): Promise<NewChainAccess> {
  if (!session?.user?.id) return refuse("Unauthorized", 401);
  const jar = await cookies();
  if (isReadOnlyImpersonation(session, jar)) return refuse("Read-only: viewing another user", 403);

  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return { ok: false, response: pol };

  const isSuper = isSuperuser(session);
  if (!isSuper) {
    const feat = await gateFeature(session.user.id, CREATE_VALUE_CHAIN_FEATURE);
    if (feat) return { ok: false, response: feat };
    const level = await resolveEffectiveLevelId(session.user.id);
    if (!atLeastTier(level, "expert")) return refuse("Create a New Value Chain is available on Expert and above.", 403);
  }

  try {
    const { orgId, userId, role } = await requireRole(session, jar, WRITE_ROLES);
    return { ok: true, userId, userName: session.user.name || session.user.email || "", orgId, isSuper, isOrgAdmin: isOrgAdminRole(role) };
  } catch (err) {
    if (err instanceof OrgContextError) return refuse(err.message, err.status);
    throw err;
  }
}
