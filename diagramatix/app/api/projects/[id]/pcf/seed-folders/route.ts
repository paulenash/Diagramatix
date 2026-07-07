import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { seedFoldersFromPcf, type SeedFolderTree, type SeedPcfNode } from "@/app/lib/pcf/folderSeed";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/pcf/seed-folders  { frameworkId, maxLevel?, underFolderId? }
 * Append a folder structure to this project mirroring a PCF branch (down to
 * maxLevel: 1 Categories · 2 +Process Groups · 3 +Processes …). Owner-level —
 * it edits the project's folder tree. The framework must be visible to the org.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (isReadOnlyImpersonation(session, await cookies())) {
    return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
  }
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "owner"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const frameworkId = String(body?.frameworkId ?? "");
  const maxLevel = Math.max(1, Math.min(5, Number(body?.maxLevel) || 2));
  const underFolderId = typeof body?.underFolderId === "string" ? body.underFolderId : null;
  if (!frameworkId) return NextResponse.json({ error: "frameworkId required" }, { status: 400 });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] },
    select: { id: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  const [project, pcfNodes] = await Promise.all([
    prisma.project.findUnique({ where: { id }, select: { folderTree: true } }),
    prisma.pcfNode.findMany({
      where: { frameworkId, active: true, level: { lte: maxLevel } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: { id: true, hierarchyId: true, name: true, level: true, parentId: true },
    }),
  ]);

  const existing = (project?.folderTree ?? { folders: [], diagramFolderMap: {} }) as unknown as SeedFolderTree;
  const { tree, added } = seedFoldersFromPcf(existing, pcfNodes as SeedPcfNode[], { maxLevel, underFolderId });

  try {
    await prisma.$executeRawUnsafe('UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', JSON.stringify(tree), id);
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/projects/${id}/pcf/seed-folders]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
