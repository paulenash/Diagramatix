import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { gateLimit } from "@/app/lib/subscription-route";
import { ARCHIVE_PROJECT_NAME } from "@/app/lib/archive";
import {
  getCurrentOrgId,
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback */ }

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Returns every project the caller can see:
  //   • projects they own AND that live in their active Org, or
  //   • projects shared to them via ProjectShare (any Org).
  //
  // The orgId filter applies ONLY to the owned branch. Shared projects
  // surface regardless of which Org they live in — the recipient was
  // given explicit access and would otherwise have to switch Org just
  // to see the share, which defeats the point. Every user gets their
  // own Org by default, so a strict org filter on the shared branch
  // would make every cross-user share invisible to the recipient.
  //
  // Each row carries enough metadata for the dashboard tile to render
  // without an N+1: owner identity (for the "by …" line on shared tiles)
  // and the caller's own share row (empty array when caller is owner).
  const projects = await prisma.project.findMany({
    where: {
      name: { not: ARCHIVE_PROJECT_NAME },
      OR: [
        { userId, orgId },
        { shares: { some: { userId } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { diagrams: true, shares: true } },
      user: { select: { id: true, name: true, email: true } },
      shares: { where: { userId }, select: { role: true } },
    },
  });

  return NextResponse.json(projects);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch {
    // cookies() may fail in some contexts — if so, proceed normally (not impersonating)
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const { name } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Subscription cap: total projects per user.
  const limitBlock = await gateLimit(session.user.id, "projects");
  if (limitBlock) return limitBlock;

  const project = await prisma.project.create({
    data: {
      name: name.trim(),
      userId: session.user.id,
      orgId,
      ownerName: session.user.name ?? session.user.email ?? "",
    },
  });

  return NextResponse.json(project, { status: 201 });
}
