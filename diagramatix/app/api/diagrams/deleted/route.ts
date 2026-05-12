import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { ARCHIVE_PROJECT_NAME, restoreDiagram } from "@/app/lib/archive";

/** GET /api/diagrams/deleted — list diagrams the current user has deleted (archived) */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }

  // Find any archive projects (system-wide — archives exist under superusers)
  const archiveProjects = await prisma.project.findMany({
    where: { name: ARCHIVE_PROJECT_NAME },
    select: { id: true },
  });
  if (archiveProjects.length === 0) return NextResponse.json([]);

  // Find all archived diagrams and filter to those originally owned by the current user
  const diagrams = await prisma.diagram.findMany({
    where: { projectId: { in: archiveProjects.map(p => p.id) } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, type: true, data: true, updatedAt: true },
  });

  const result = diagrams
    .map((d) => {
      const data = (d.data as Record<string, unknown>) ?? {};
      const meta = (data._archive as Record<string, unknown>) ?? {};
      return {
        id: d.id,
        name: d.name,
        type: d.type,
        archivedAt: meta._archivedAt ?? d.updatedAt.toISOString(),
        originalUserId: meta._archivedFromUserId ?? null,
        originalUserEmail: meta._archivedFromUserEmail ?? null,
        originalProjectName: meta._archivedFromProjectName ?? null,
        originalProjectId: meta._archivedFromProjectId ?? null,
        originalFolderName: meta._archivedFromFolderName ?? null,
        originalFolderId: meta._archivedFromFolderId ?? null,
      };
    })
    .filter((d) => d.originalUserId === userId);

  return NextResponse.json(result);
}

/** DELETE /api/diagrams/deleted — permanently remove archived diagrams.
 *  Body: `{ ids: string[] }`. Each id must reference a diagram whose
 *  `_archive._archivedFromUserId` matches the effective caller (the
 *  same scoping rule POST uses for restore). Other diagrams in the list
 *  are silently skipped. Returns `{ deleted: number, skipped: string[] }`. */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }

  let body: { ids?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });

  // Load each diagram, verify it's archived to the caller's user, then delete.
  const skipped: string[] = [];
  let deleted = 0;
  for (const id of ids) {
    const diagram = await prisma.diagram.findUnique({ where: { id } });
    if (!diagram) { skipped.push(id); continue; }
    const data = (diagram.data as Record<string, unknown>) ?? {};
    const meta = (data._archive as Record<string, unknown>) ?? {};
    if (meta._archivedFromUserId !== userId) { skipped.push(id); continue; }
    await prisma.diagram.delete({ where: { id } });
    deleted++;
  }
  return NextResponse.json({ deleted, skipped });
}

/** POST /api/diagrams/deleted — restore a user's deleted diagram */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* ignore */ }

  const { diagramId } = await req.json();
  if (!diagramId) return NextResponse.json({ error: "diagramId required" }, { status: 400 });

  // Verify this diagram was originally owned by the current user
  const diagram = await prisma.diagram.findUnique({ where: { id: diagramId } });
  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const data = (diagram.data as Record<string, unknown>) ?? {};
  const meta = (data._archive as Record<string, unknown>) ?? {};
  if (meta._archivedFromUserId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await restoreDiagram(diagramId);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
