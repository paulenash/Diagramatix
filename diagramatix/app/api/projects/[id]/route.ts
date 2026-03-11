import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

type Params = { params: Promise<{ id: string }> };

async function getAuthorizedProject(id: string, userId: string) {
  return prisma.project.findFirst({ where: { id, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id },
    include: {
      diagrams: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
      },
    },
  });

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(project);
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getAuthorizedProject(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, colorConfig } = body;

  if (name !== undefined && !name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    // Update name via Prisma ORM if provided
    if (name !== undefined) {
      await prisma.project.update({ where: { id }, data: { name: name.trim() } });
    }
    // Update colorConfig via raw SQL — Prisma 7 parameterization schema
    // does not include JSON fields in the ProjectUpdateInput graph.
    if (colorConfig !== undefined) {
      await prisma.$executeRawUnsafe(
        'UPDATE "Project" SET "colorConfig" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2',
        JSON.stringify(colorConfig),
        id
      );
    }
    const updated = await prisma.project.findFirst({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/projects] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getAuthorizedProject(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // SetNull cascade handles moving diagrams to Unorganized
  await prisma.project.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
