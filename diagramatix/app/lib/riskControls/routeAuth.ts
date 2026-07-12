/** Compact auth guards for the Risk & Control route trees, so each handler
 *  stays short. Mirror the inline pattern used across the app (auth → org/
 *  project gate → read-only-impersonation block) in one place. */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireOrgAdminFor, requireProjectAccess, OrgContextError, type ProjectAccessRole } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";

type Guard<T> = { error: NextResponse; ctx: null } | { error: null; ctx: T };

const readonly = () => ({ error: NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 }), ctx: null } as const);
const fromErr = (err: unknown) => {
  if (err instanceof OrgContextError) return { error: NextResponse.json({ error: err.message }, { status: err.status }), ctx: null } as const;
  throw err;
};

/** riskControl feature gate for a mutating Risk & Control / Compliance action.
 *  Returns a 403 Guard when the caller's tier doesn't include the feature.
 *  Applied on mutate only so passive loads (e.g. the diagram editor reading
 *  element attachments) still work for users whose tier lacks the feature. */
async function gateRiskControl(userId: string | undefined): Promise<{ error: NextResponse; ctx: null } | null> {
  const fg = await gateFeature(userId ?? "", "riskControl");
  return fg ? { error: fg, ctx: null } : null;
}

/** SuperAdmin OR Owner/Admin of the org. `mutate` blocks read-only impersonation. */
export async function guardOrg(orgId: string, mutate: boolean): Promise<Guard<Record<string, never>>> {
  const session = await auth();
  const jar = await cookies();
  if (mutate && isReadOnlyImpersonation(session, jar)) return readonly();
  try {
    await requireOrgAdminFor(session, jar, orgId);
    if (mutate) { const g = await gateRiskControl(session?.user?.id); if (g) return g; }
    return { error: null, ctx: {} };
  }
  catch (err) { return fromErr(err); }
}

/** Project access at `role`. `mutate` blocks read-only impersonation. */
export async function guardProject(projectId: string, role: ProjectAccessRole, mutate: boolean): Promise<Guard<{ projectOrgId: string }>> {
  const session = await auth();
  const jar = await cookies();
  if (mutate && isReadOnlyImpersonation(session, jar)) return readonly();
  try {
    const access = await requireProjectAccess(session, jar, projectId, role);
    if (mutate) { const g = await gateRiskControl(session?.user?.id); if (g) return g; }
    return { error: null, ctx: { projectOrgId: access.projectOrgId } };
  }
  catch (err) { return fromErr(err); }
}

/** Confirm a library belongs to the given owner scope; 404 NextResponse if not. */
export async function ownedLibrary(where: { id: string; orgId?: string; projectId?: string }): Promise<NextResponse | null> {
  const lib = await prisma.riskControlLibrary.findFirst({ where, select: { id: true } });
  return lib ? null : NextResponse.json({ error: "Library not found" }, { status: 404 });
}
