import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const diagrams = await prisma.diagram.findMany({
    where: { userId: session.user.id },
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

  const body = await req.json();
  const { name, type = "context", projectId } = body;

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
      data: EMPTY_DIAGRAM as any,
      userId: session.user.id,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json(diagram, { status: 201 });
}
