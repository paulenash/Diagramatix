import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

// Sentinel asUserId meaning "every user I'm allowed to inspect".
const ALL = "__all__";

// GET /api/notifications/list?asUserId=<id|__all__>
//
// Enriched notification feed for the full Notifications page. Each row
// carries the recipient (+ their Org), the sender (name+email), and the
// diagram (id+name) so every diagram-bearing type renders a hyperlink.
//
// asUserId:
//   • omitted / === caller → the caller's own feed.
//   • a specific userId → that user's feed (SuperAdmin any; OrgAdmin only
//     users in their active Org).
//   • "__all__" → every notification the caller may inspect (SuperAdmin:
//     all users; OrgAdmin: all members of their active Org).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const callerId = session.user.id;
  const asUserId = new URL(req.url).searchParams.get("asUserId") ?? callerId;

  const su = isSuperuser(session);

  // Resolve the OrgAdmin's org once if we'll need it for gating.
  let callerOrgId: string | null = null;
  let callerIsOrgAdmin = false;
  if (!su && (asUserId !== callerId)) {
    const cookieStore = await cookies();
    callerOrgId = await tryGetCurrentOrgId(session, cookieStore);
    if (callerOrgId) {
      const m = await prisma.orgMember.findFirst({
        where: { userId: callerId, orgId: callerOrgId, role: { in: ["Owner", "Admin"] } },
        select: { id: true },
      });
      callerIsOrgAdmin = !!m;
    }
  }

  // Build the recipient filter (which users' notifications to return).
  let userWhere: { userId?: string | { in: string[] } };
  if (asUserId === callerId) {
    userWhere = { userId: callerId };
  } else if (asUserId === ALL) {
    if (su) {
      userWhere = {}; // all users
    } else if (callerIsOrgAdmin && callerOrgId) {
      const members = await prisma.orgMember.findMany({
        where: { orgId: callerOrgId },
        select: { userId: true },
      });
      userWhere = { userId: { in: members.map(m => m.userId) } };
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    // A specific other user.
    if (su) {
      userWhere = { userId: asUserId };
    } else if (callerIsOrgAdmin && callerOrgId) {
      const target = await prisma.orgMember.findFirst({
        where: { userId: asUserId, orgId: callerOrgId },
        select: { id: true },
      });
      if (!target) return NextResponse.json({ error: "User is not in your Org" }, { status: 403 });
      userWhere = { userId: asUserId };
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const rows = await prisma.notification.findMany({
    where: userWhere,
    orderBy: { createdAt: "desc" },
    take: 500,
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  // Resolve senders, diagrams, and recipient orgs referenced by the rows.
  const senderIds = new Set<string>();
  const diagramIds = new Set<string>();
  const recipientIds = new Set<string>();
  for (const r of rows) {
    recipientIds.add(r.userId);
    const p = r.payload as { fromUserId?: string; diagramId?: string; rootDiagramId?: string } | null;
    if (p?.fromUserId) senderIds.add(p.fromUserId);
    if (p?.diagramId) diagramIds.add(p.diagramId);
    else if (p?.rootDiagramId) diagramIds.add(p.rootDiagramId);
  }
  const [senders, diagrams, memberships] = await Promise.all([
    senderIds.size === 0 ? [] : prisma.user.findMany({
      where: { id: { in: Array.from(senderIds) } },
      select: { id: true, name: true, email: true },
    }),
    diagramIds.size === 0 ? [] : prisma.diagram.findMany({
      where: { id: { in: Array.from(diagramIds) } },
      select: { id: true, name: true },
    }),
    recipientIds.size === 0 ? [] : prisma.orgMember.findMany({
      where: { userId: { in: Array.from(recipientIds) } },
      select: { userId: true, orgId: true, org: { select: { name: true } } },
    }),
  ]);
  const senderById = new Map(senders.map(s => [s.id, s]));
  const diagramById = new Map(diagrams.map(d => [d.id, d]));
  // First membership per user is good enough for the display column.
  const orgByUser = new Map<string, { id: string; name: string }>();
  for (const m of memberships) {
    if (!orgByUser.has(m.userId)) orgByUser.set(m.userId, { id: m.orgId, name: m.org.name });
  }

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
      };
      const senderRow = p.fromUserId ? senderById.get(p.fromUserId) ?? null : null;
      const sender = senderRow
        ? { id: senderRow.id, name: senderRow.name, email: senderRow.email }
        : p.fromUserId
          ? { id: p.fromUserId, name: p.fromUserName ?? null, email: p.fromUserEmail ?? "(deleted user)" }
          : null;

      const dgId = p.diagramId ?? p.rootDiagramId ?? null;
      const dgRow = dgId ? diagramById.get(dgId) ?? null : null;
      const diagram = dgId ? { id: dgId, name: dgRow?.name ?? p.diagramName ?? "(diagram)" } : null;

      return {
        id: r.id,
        type: r.type,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt ? r.readAt.toISOString() : null,
        recipient: { id: r.user.id, name: r.user.name, email: r.user.email },
        recipientOrg: orgByUser.get(r.userId) ?? null,
        sender,
        diagram,
        reviewId: p.reviewId ?? null,
        groupName: p.groupName ?? null,
        bundleName: p.bundleName ?? null,
      };
    }),
  });
}
