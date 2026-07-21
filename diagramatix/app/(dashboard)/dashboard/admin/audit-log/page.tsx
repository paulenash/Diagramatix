import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { prisma } from "@/app/lib/db";
import { AuditLogClient, type AuditRow } from "./AuditLogClient";

/**
 * SuperAdmin: Audit Log — an append-only record of privileged / sensitive actions
 * (impersonation, exports/backups, wipe restores, user deletes, org policy edits).
 * Read-only viewer over the AuditLog table (Phase A2, ENT-03).
 */
export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");

  const rows = await prisma.auditLog.findMany({
    orderBy: { at: "desc" },
    take: 500,
    select: {
      id: true, at: true, actorEmail: true, effectiveUserId: true, orgId: true,
      action: true, targetType: true, targetId: true, meta: true, ip: true,
    },
  });
  const entries: AuditRow[] = rows.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorEmail: r.actorEmail,
    effectiveUserId: r.effectiveUserId,
    orgId: r.orgId,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    meta: r.meta,
    ip: r.ip,
  }));

  return <AuditLogClient entries={entries} />;
}
