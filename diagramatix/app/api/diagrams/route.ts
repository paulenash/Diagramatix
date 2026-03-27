import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getEffectiveUserId(session, await cookies());
  const diagrams = await prisma.diagram.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(diagrams);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isImpersonating(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const body = await req.json();
  const { name, type = "context", projectId, data, colorConfig, displayMode } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Validate project ownership if supplied
  if (projectId) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: name.trim(),
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: (data ?? EMPTY_DIAGRAM) as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(colorConfig ? { colorConfig: colorConfig as any } : {}),
      ...(displayMode ? { displayMode } : {}),
      userId: session.user.id,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json(diagram, { status: 201 });
}
