// Server-only. Append-only audit trail for privileged / sensitive actions, so
// SuperAdmin, impersonation, export, delete and policy activity is attributable
// and reviewable (Phase A2, ENT-03). recordAudit NEVER throws — auditing must not
// break the primary action — but it logs its own failure. `meta` must contain
// ids / counts / modes / hashes only, never raw process or PII content.
import { prisma } from "@/app/lib/db";

/** Known action verbs (dotted). Free-form is allowed, but prefer these for consistency. */
export const AUDIT = {
  ImpersonateStart: "impersonate.start",
  ImpersonateStop: "impersonate.stop",
  ExportFullBackup: "export.full-backup",
  RestoreWipe: "restore.wipe",
  ExportOrgBackup: "export.org-backup",
  UserDelete: "user.delete",
  UserSelfDelete: "user.self-delete",
  OrgSettingsUpdate: "org.settings.update",
  ShareCreate: "share.create",
  ShareRevoke: "share.revoke",
} as const;

interface SessionLike { user?: { id?: string; email?: string | null } }

export interface AuditEntry {
  actorUserId?: string | null;
  actorEmail?: string | null;
  effectiveUserId?: string | null;
  orgId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  meta?: Record<string, unknown>;
  ip?: string | null;
}

/** Best-effort actor + ip from a session and (optional) request. */
export function auditActor(session: SessionLike | null, req?: Request): { actorUserId: string | null; actorEmail: string | null; ip: string | null } {
  return {
    actorUserId: session?.user?.id ?? null,
    actorEmail: session?.user?.email ?? null,
    ip: req ? ipFromRequest(req) : null,
  };
}

export function ipFromRequest(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}

/** Write one audit row. Never throws. */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        actorEmail: entry.actorEmail ?? null,
        effectiveUserId: entry.effectiveUserId ?? null,
        orgId: entry.orgId ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        meta: JSON.stringify(entry.meta ?? {}),
        ip: entry.ip ?? null,
      },
    });
  } catch (e) {
    console.error("[audit] failed to record", entry.action, e instanceof Error ? e.message : e);
  }
}
