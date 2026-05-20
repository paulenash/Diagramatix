/**
 * Support-clone a diagram. Used by the orange impersonation banner's
 * "Copy to my account" button while the superuser is in EDIT mode on
 * another user's diagram. Creates a fresh Project under the admin's
 * account named "<TargetUser Name> <email>" and clones the specified
 * diagram into it. Does NOT touch the target user's data.
 *
 * Auth:
 *   - caller must be a superuser
 *   - an impersonation session must be active
 * Mode is not strictly required server-side but the button only renders
 * in edit mode so it'll never arrive otherwise.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, isImpersonating, getViewAsUserId } from "@/app/lib/superuser";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cookieStore = await cookies();
  if (!isImpersonating(session, cookieStore)) {
    return NextResponse.json(
      { error: "No impersonation session active" },
      { status: 400 },
    );
  }
  const targetUserId = getViewAsUserId(session, cookieStore);
  if (!targetUserId) {
    return NextResponse.json(
      { error: "Impersonation target missing" },
      { status: 400 },
    );
  }

  const { diagramId } = (await req.json()) as { diagramId?: string };
  if (!diagramId) {
    return NextResponse.json({ error: "diagramId required" }, { status: 400 });
  }

  // Fetch the target user's diagram. We don't constrain by orgId here —
  // superuser support-cloning crosses org boundaries by design.
  const source = await prisma.diagram.findFirst({
    where: { id: diagramId, userId: targetUserId },
  });
  if (!source) {
    return NextResponse.json({ error: "Diagram not found" }, { status: 404 });
  }

  // Fetch the target user so we can name the project after them.
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }
  const projectName = `${(target.name ?? "User").trim()} ${target.email}`.trim();

  // Admin's first org membership — use as the new project / diagram org.
  const adminOrg = await prisma.orgMember.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
    select: { orgId: true },
  });
  if (!adminOrg) {
    return NextResponse.json(
      { error: "Admin account has no org membership" },
      { status: 500 },
    );
  }

  const project = await prisma.project.create({
    data: {
      name: projectName,
      description: `Support copy of "${source.name}" from ${target.email}`,
      ownerName: "",
      userId: session.user.id,
      orgId: adminOrg.orgId,
    },
  });

  const clonedDiagram = await prisma.diagram.create({
    data: {
      name: source.name,
      type: source.type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: source.data as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      colorConfig: source.colorConfig as any,
      displayMode: source.displayMode,
      userId: session.user.id,
      orgId: adminOrg.orgId,
      projectId: project.id,
    },
  });

  return NextResponse.json({ project, diagram: clonedDiagram }, { status: 201 });
}
