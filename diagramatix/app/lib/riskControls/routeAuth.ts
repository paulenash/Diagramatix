/** Compact auth guards for the Risk & Control route trees, so each handler
 *  stays short. These are the shared wrappers in app/lib/routeGuard.ts with
 *  the feature slug pinned to "riskControl" — the ordering (auth → org/project
 *  gate → read-only-impersonation block → feature gate) lives there, in one
 *  place, so this tree and the rest of the app cannot drift apart (ARCH-01). */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { guardOrgRoute, guardProjectRoute } from "@/app/lib/routeGuard";
import { type ProjectAccessRole } from "@/app/lib/auth/orgContext";

type Guard<T> = { error: NextResponse; ctx: null } | { error: null; ctx: T };

/** SuperAdmin OR Owner/Admin of the org. `mutate` blocks read-only impersonation.
 *  The riskControl feature gate is applied on mutate only, so passive loads
 *  (e.g. the diagram editor reading element attachments) still work for users
 *  whose tier lacks the feature. */
export async function guardOrg(orgId: string, mutate: boolean): Promise<Guard<Record<string, never>>> {
  const g = await guardOrgRoute(orgId, { mutate, feature: "riskControl" });
  return g.error ? { error: g.error, ctx: null } : { error: null, ctx: {} };
}

/** Project access at `role`. `mutate` blocks read-only impersonation. */
export async function guardProject(projectId: string, role: ProjectAccessRole, mutate: boolean): Promise<Guard<{ projectOrgId: string }>> {
  const g = await guardProjectRoute(projectId, role, { mutate, feature: "riskControl" });
  return g.error ? { error: g.error, ctx: null } : { error: null, ctx: { projectOrgId: g.ctx.projectOrgId } };
}

/** Confirm a library belongs to the given owner scope; 404 NextResponse if not. */
export async function ownedLibrary(where: { id: string; orgId?: string; projectId?: string }): Promise<NextResponse | null> {
  const lib = await prisma.riskControlLibrary.findFirst({ where, select: { id: true } });
  return lib ? null : NextResponse.json({ error: "Library not found" }, { status: 404 });
}
