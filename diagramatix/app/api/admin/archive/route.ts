import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME, restoreDiagram } from "@/app/lib/archive";

/** GET — list all archived diagrams (superuser only) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find archive project
  const archive = await prisma.project.findFirst({
    where: { name: ARCHIVE_PROJECT_NAME, userId: session.user.id },
    select: { id: true },
  });

  if (!archive) {
    return NextResponse.json([]);
  }

  const diagrams = await prisma.diagram.findMany({
    where: { projectId: archive.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      data: true,
      updatedAt: true,
    },
  });

  // Extract archive metadata from each diagram's data
  const result = diagrams.map((d) => {
    const data = (d.data as Record<string, unknown>) ?? {};
    const meta = (data._archive as Record<string, unknown>) ?? {};
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      archivedAt: meta._archivedAt ?? d.updatedAt.toISOString(),
      originalUserEmail: meta._archivedFromUserEmail ?? "Unknown",
      originalProjectName: meta._archivedFromProjectName ?? null,
      originalProjectId: meta._archivedFromProjectId ?? null,
    };
  });

  return NextResponse.json(result);
}

/** POST — restore an archived diagram */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { diagramId } = (await req.json()) as { diagramId?: string };
  if (!diagramId) {
    return NextResponse.json({ error: "diagramId required" }, { status: 400 });
  }

  const result = await restoreDiagram(diagramId);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
