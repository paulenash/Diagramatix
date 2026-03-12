import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

type Params = { params: Promise<{ id: string }> };

async function getAuthorizedDiagram(id: string, userId: string) {
  return prisma.diagram.findFirst({ where: { id, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const diagram = await getAuthorizedDiagram(id, session.user.id);
  if (!diagram) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(diagram);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getAuthorizedDiagram(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, data, projectId, colorConfig } = body;

  // Validate project ownership if non-null projectId supplied
  if (projectId !== undefined && projectId !== null) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  await prisma.diagram.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(data !== undefined && { data: data as any }),
      ...(projectId !== undefined && { projectId }),
    },
  });

  // Update colorConfig via raw SQL (Prisma 7 JSON field limitation)
  if (colorConfig !== undefined) {
    await prisma.$executeRawUnsafe(
      'UPDATE "Diagram" SET "colorConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
      JSON.stringify(colorConfig),
      id
    );
  }

  const updated = await prisma.diagram.findFirst({ where: { id } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getAuthorizedDiagram(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.diagram.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
