import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME, restoreDiagram } from "@/app/lib/archive";

/** GET — list all archived diagrams (superuser only).
 *
 *  Returns the User → Project → Folder hierarchy needed by the admin
 *  archive tree view. Every field is sourced from the archive metadata
 *  stuffed into `data._archive` at archive time (see archive.ts). */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Find the system archive project (owned by the first superuser).
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

  // Extract archive metadata from each diagram's data JSON.
  const result = diagrams.map((d) => {
    const data = (d.data as Record<string, unknown>) ?? {};
    const meta = (data._archive as Record<string, unknown>) ?? {};
    return {
      id: d.id,
      name: d.name,
      type: d.type,
      archivedAt: meta._archivedAt ?? d.updatedAt.toISOString(),
      originalUserId: meta._archivedFromUserId ?? null,
      originalUserEmail: meta._archivedFromUserEmail ?? "Unknown",
      originalProjectId: meta._archivedFromProjectId ?? null,
      originalProjectName: meta._archivedFromProjectName ?? null,
      originalFolderId: meta._archivedFromFolderId ?? null,
      originalFolderName: meta._archivedFromFolderName ?? null,
    };
  });

  return NextResponse.json(result);
}

/** POST — restore an archived diagram (superuser only). */
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

/** DELETE — permanently delete archived diagrams (superuser only).
 *
 *  Body accepts either:
 *   - { ids: string[] }  — delete the listed archived diagrams
 *   - { all: true }      — delete EVERY diagram currently in the system archive
 *
 *  Each id is validated to belong to the system archive project before
 *  it's deleted, so this endpoint cannot be tricked into purging live
 *  diagrams. DiagramHistory rows cascade-delete via Prisma's
 *  onDelete: Cascade on DiagramHistory.diagram. */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const archive = await prisma.project.findFirst({
    where: { name: ARCHIVE_PROJECT_NAME, userId: session.user.id },
    select: { id: true },
  });
  if (!archive) {
    return NextResponse.json({ deleted: 0 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    ids?: string[];
    all?: boolean;
  };

  if (body.all === true) {
    const result = await prisma.diagram.deleteMany({
      where: { projectId: archive.id },
    });
    return NextResponse.json({ deleted: result.count, all: true });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids array or all:true required" }, { status: 400 });
  }

  // Restrict to ids that actually live in the archive project — defence
  // against a forged payload pointing at live diagrams.
  const result = await prisma.diagram.deleteMany({
    where: { id: { in: ids }, projectId: archive.id },
  });
  return NextResponse.json({ deleted: result.count });
}
