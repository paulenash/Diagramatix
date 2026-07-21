/**
 * Admin: delete a user permanently.
 *
 *   DELETE /api/admin/users/[id]
 *     Body: { confirmEmail: string } — must match the target user's
 *     email exactly. Belt-and-braces for the two-level UI confirmation.
 *
 * Cascades:
 *   - Diagram (User onDelete: Cascade) → DiagramHistory (Diagram onDelete: Cascade)
 *   - Project (User onDelete: Cascade)
 *   - OrgMember (User onDelete: Cascade)
 *   - DiagramTemplate (User onDelete: Cascade)
 *   - Prompt (User onDelete: Cascade)
 *   - DiagramRules (User onDelete: Cascade for the optional FK)
 *   - UsageCounter (User onDelete: Cascade)
 *
 * Author attribution (SetNull, audit DATA-01 fix — schema v1.19):
 *   - PublishedVersion.publishedById, PublicationBundle.publishedById,
 *     PublicationBundleAudience.addedById, PendingBundleAudience.invitedById
 *     were onDelete: Restrict, which made any user who had ever published
 *     a version or bundle undeletable (the delete 500'd on the FK). They
 *     are now nullable + SetNull, so the published artifact survives with
 *     a null author and the delete succeeds.
 *
 * NOT deleted:
 *   - Org rows. If the deleted user was the sole member of an Org, the
 *     Org persists as an orphan. Acceptable for the test-cycle use
 *     case; cleanup can be a follow-up if needed.
 *
 * Guardrails:
 *   - isSuperuser only.
 *   - Cannot delete yourself (returns 400).
 *   - Cannot delete another superuser (returns 400) — prevents an
 *     admin from locking themselves and the other admin out by
 *     deleting both accounts.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { recordAudit, AUDIT, ipFromRequest } from "@/app/lib/audit";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;

  // Block self-delete so an admin can't accidentally lock themselves out.
  if (id === session?.user?.id) {
    return NextResponse.json(
      { error: "You can't delete your own account" },
      { status: 400 },
    );
  }

  let body: { confirmEmail?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      _count: { select: { projects: true, diagrams: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Block deletion of the other superuser. Self-delete is already
  // blocked above; this catches "admin A deletes admin B".
  if (SUPERUSER_EMAILS.has(target.email)) {
    return NextResponse.json(
      { error: "Cannot delete another administrator account" },
      { status: 400 },
    );
  }

  // Belt-and-braces: the client-side flow asks the admin to type the
  // email. Reject the request if it doesn't arrive at the server.
  if (
    typeof body.confirmEmail !== "string" ||
    body.confirmEmail.trim().toLowerCase() !== target.email.trim().toLowerCase()
  ) {
    return NextResponse.json(
      { error: "confirmEmail did not match the target user's email" },
      { status: 400 },
    );
  }

  // Single delete — Prisma's onDelete:Cascade rules on the dependents
  // (Diagram, Project, OrgMember, DiagramTemplate, Prompt, DiagramRules,
  // UsageCounter) handle the rest. DiagramHistory cascades from Diagram.
  await recordAudit({
    actorUserId: session?.user?.id ?? null, actorEmail: session?.user?.email ?? null,
    action: AUDIT.UserDelete, targetType: "user", targetId: target.id,
    meta: { targetEmail: target.email, projects: target._count.projects, diagrams: target._count.diagrams },
    ip: ipFromRequest(req),
  });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({
    deleted: {
      id: target.id,
      email: target.email,
      name: target.name,
      projects: target._count.projects,
      diagrams: target._count.diagrams,
    },
  });
}
