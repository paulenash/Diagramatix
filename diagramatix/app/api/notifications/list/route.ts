import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

// GET /api/notifications/list?asUserId=<id>
//
// Enriched notification feed for the full Notifications page. Each row
// carries the recipient, the sender (name+email — resolved from the
// payload, falling back to a User join), and the diagram (id+name —
// from the payload, falling back to a Diagram join) so every type that
// references a diagram renders an explicit hyperlink.
//
// Access:
//   • No asUserId, or asUserId === caller → the caller's own feed.
//   • asUserId !== caller → allowed only if the caller is a SuperAdmin
//     (any user) or an OrgAdmin/Owner of the target user's active Org
//     (a user in their Org).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const asUserId = new URL(req.url).searchParams.get("asUserId") ?? callerId;

  // Authorise cross-user access.
  if (asUserId !== callerId) {
    const su = isSuperuser(session);
    if (!su) {
      // OrgAdmin path: the caller must be Owner/Admin of an Org the
      // target user belongs to.
      const cookieStore = await cookies();
      const callerOrgId = await tryGetCurrentOrgId(session, cookieStore);
      if (!callerOrgId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const callerMembership = await prisma.orgMember.findFirst({
        where: { userId: callerId, orgId: callerOrgId, role: { in: ["Owner", "Admin"] } },
        select: { id: true },
      });
      if (!callerMembership) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const targetMembership = await prisma.orgMember.findFirst({
        where: { userId: asUserId, orgId: callerOrgId },
        select: { id: true },
      });
      if (!targetMembership) {
        return NextResponse.json({ error: "User is not in your Org" }, { status: 403 });
      }
    }
  }

  // Cap at 500 — plenty for the current user base and keeps the page snappy.
  const rows = await prisma.notification.findMany({
    where: { userId: asUserId },
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Resolve senders + diagrams referenced in payloads in one round-trip each,
  // so old rows missing fromUserName / diagramName still render fully.
  const senderIds = new Set<string>();
  const diagramIds = new Set<string>();
  for (const r of rows) {
    const p = r.payload as { fromUserId?: string; diagramId?: string; rootDiagramId?: string } | null;
    if (p?.fromUserId) senderIds.add(p.fromUserId);
    if (p?.diagramId) diagramIds.add(p.diagramId);
    else if (p?.rootDiagramId) diagramIds.add(p.rootDiagramId);
  }
  const [senders, diagrams] = await Promise.all([
    senderIds.size === 0 ? [] : prisma.user.findMany({
      where: { id: { in: Array.from(senderIds) } },
      select: { id: true, name: true, email: true },
    }),
    diagramIds.size === 0 ? [] : prisma.diagram.findMany({
      where: { id: { in: Array.from(diagramIds) } },
      select: { id: true, name: true },
    }),
  ]);
  const senderById = new Map(senders.map(s => [s.id, s]));
  const diagramById = new Map(diagrams.map(d => [d.id, d]));

  return NextResponse.json({
    rows: rows.map(r => {
      const p = (r.payload ?? {}) as {
        fromUserId?: string;
        fromUserName?: string | null;
        fromUserEmail?: string;
        diagramId?: string;
        diagramName?: string;
        rootDiagramId?: string;
        reviewId?: string;
        groupName?: string;
        bundleName?: string;
        feedbackId?: string;
      };
      const senderRow = p.fromUserId ? senderById.get(p.fromUserId) ?? null : null;
      const sender = senderRow
        ? { id: senderRow.id, name: senderRow.name, email: senderRow.email }
        : p.fromUserId
          ? { id: p.fromUserId, name: p.fromUserName ?? null, email: p.fromUserEmail ?? "(deleted user)" }
          : null;

      const dgId = p.diagramId ?? p.rootDiagramId ?? null;
      const dgRow = dgId ? diagramById.get(dgId) ?? null : null;
      const diagram = dgId
        ? { id: dgId, name: dgRow?.name ?? p.diagramName ?? "(diagram)" }
        : null;

      return {
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        recipient: { id: r.user.id, name: r.user.name, email: r.user.email },
        sender,
        diagram,
        reviewId: p.reviewId ?? null,
        groupName: p.groupName ?? null,
        bundleName: p.bundleName ?? null,
      };
    }),
  });
}
