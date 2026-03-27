import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string }> };

async function getAuthorizedDiagram(id: string, userId: string) {
  return prisma.diagram.findFirst({ where: { id, userId } });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = getEffectiveUserId(session, await cookies());
  const { id } = await params;
  const diagram = await getAuthorizedDiagram(id, userId);
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

  if (isImpersonating(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await getAuthorizedDiagram(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { name, data, projectId, colorConfig, displayMode } = body;

  // Validate project ownership if non-null projectId supplied
  if (projectId !== undefined && projectId !== null) {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId: session.user.id } });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  try {
    if (name !== undefined || data !== undefined || projectId !== undefined || colorConfig !== undefined || displayMode !== undefined) {
      await prisma.diagram.update({
        where: { id },
        data: {
          ...(name !== undefined && { name }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(data !== undefined && { data: data as any }),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ...(colorConfig !== undefined && { colorConfig: colorConfig as any }),
          ...(projectId !== undefined && { projectId }),
          ...(displayMode !== undefined && { displayMode }),
        },
      });
    }

    const updated = await prisma.diagram.findFirst({ where: { id } });
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/diagrams] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isImpersonating(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }

  const { id } = await params;
  const existing = await getAuthorizedDiagram(id, session.user.id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.diagram.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
