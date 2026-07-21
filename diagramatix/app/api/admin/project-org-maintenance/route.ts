/**
 * POST /api/admin/project-org-maintenance   { projectId, newOrgId }
 *
 * Re-home a Project under a different owning Org ("Org Owner"), then renumber the
 * Risk & Control codes of BOTH orgs so each stays internally consistent:
 *   • the NEW org — required: the moved project's items still carry the old org's
 *     codes and can collide with the new org's; renumbering integrates them into
 *     one org-wide sequence and advances the new org's counters.
 *   • the OLD org — tidy: closes the gaps the departed items leave behind.
 * Renumbering touches only `code` fields; traceability links + on-model
 * attachments key off item ids, so every link is preserved.
 *
 * SuperAdmin only (a cross-tenant move). Audited. See enterprise/ + the
 * Project Org Maintenance tile.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation, isSuperuser } from "@/app/lib/superuser";
import { renumberOrgCodes } from "@/app/lib/riskControls/renumberOrg";
import { recordAudit, AUDIT, ipFromRequest } from "@/app/lib/audit";

export async function POST(req: Request) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Only a SuperAdmin can re-home a project" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId = typeof body?.projectId === "string" ? body.projectId : "";
  const newOrgId = typeof body?.newOrgId === "string" ? body.newOrgId : "";
  if (!projectId || !newOrgId) {
    return NextResponse.json({ error: "projectId and newOrgId are required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, orgId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const oldOrgId = project.orgId;
  if (oldOrgId === newOrgId) {
    return NextResponse.json({ error: "Project is already owned by that Org" }, { status: 400 });
  }

  const [newOrg, oldOrg] = await Promise.all([
    prisma.org.findUnique({ where: { id: newOrgId }, select: { id: true, name: true } }),
    oldOrgId ? prisma.org.findUnique({ where: { id: oldOrgId }, select: { id: true, name: true } }) : Promise.resolve(null),
  ]);
  if (!newOrg) return NextResponse.json({ error: "Target Org not found" }, { status: 400 });

  try {
    // 1) Flip the owner. 2) Renumber the NEW org (now includes the project).
    //    3) Renumber the OLD org (no longer includes it). Each renumber is atomic.
    await prisma.project.update({ where: { id: projectId }, data: { orgId: newOrgId } });
    const newResult = await renumberOrgCodes(prisma, newOrgId);
    const oldResult = oldOrgId ? await renumberOrgCodes(prisma, oldOrgId) : null;

    await recordAudit({
      actorUserId: session?.user?.id ?? null, actorEmail: session?.user?.email ?? null, orgId: newOrgId,
      action: AUDIT.ProjectRehome, targetType: "project", targetId: projectId,
      meta: { projectName: project.name, fromOrgId: oldOrgId, fromOrgName: oldOrg?.name ?? null, toOrgId: newOrgId, toOrgName: newOrg.name, newResult, oldResult },
      ip: ipFromRequest(req),
    });

    return NextResponse.json({
      ok: true,
      project: { id: project.id, name: project.name },
      newOrg: { id: newOrg.id, name: newOrg.name, result: newResult },
      oldOrg: oldOrg ? { id: oldOrg.id, name: oldOrg.name, result: oldResult } : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/project-org-maintenance]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
