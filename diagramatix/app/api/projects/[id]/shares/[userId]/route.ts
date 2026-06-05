import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { ProjectShareRole } from "@/app/generated/prisma/enums";

type Params = { params: Promise<{ id: string; userId: string }> };

/**
 * PUT /api/projects/[id]/shares/[userId]
 *
 * Body: { role: "VIEW" | "EDIT" }
 *
 * Owner-only role change for an existing share. 404 if the share doesn't
 * exist — the dialog should POST to create new shares, not PUT to a
 * speculative userId.
 */
export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id, userId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = (await req.json().catch(() => ({}))) as { role?: string };
  const role: ProjectShareRole | null =
    body.role === "EDIT" ? ProjectShareRole.EDIT
    : body.role === "VIEW" ? ProjectShareRole.VIEW
    : null;
  if (!role) return NextResponse.json({ error: "role must be VIEW or EDIT" }, { status: 400 });

  const existing = await prisma.projectShare.findUnique({
    where: { projectId_userId: { projectId: id, userId } },
    select: { id: true },
  });
  if (!existing) return NextResponse.json({ error: "Share not found" }, { status: 404 });

  const updated = await prisma.projectShare.update({
    where: { projectId_userId: { projectId: id, userId } },
    data: { role },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });
  return NextResponse.json(updated);
}

/**
 * DELETE /api/projects/[id]/shares/[userId]
 *
 * Owner-only. Idempotent — 200 even if the share was already gone.
 */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* cookies() may fail */ }

  const { id, userId } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "owner");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // deleteMany doesn't throw on zero rows — gives us idempotency without
  // an extra existence probe.
  await prisma.projectShare.deleteMany({
    where: { projectId: id, userId },
  });
  return NextResponse.json({ success: true });
}
