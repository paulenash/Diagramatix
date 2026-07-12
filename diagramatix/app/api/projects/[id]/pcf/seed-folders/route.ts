import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isReadOnlyImpersonation } from "@/app/lib/superuser";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { gateFeature } from "@/app/lib/subscription-route";
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
  const fg = await gateFeature(session?.user?.id ?? "", "apqc");
  if (fg) return fg;

  const body = await req.json().catch(() => ({}));
  const frameworkId = String(body?.frameworkId ?? "");
  // `depth` (relative levels below the chosen root) is the new control; when no
  // root is given it falls back to `maxLevel` (absolute level, from Categories).
  const depth = Math.max(1, Math.min(5, Number(body?.depth) || Number(body?.maxLevel) || 2));
  const rootNodeId = typeof body?.rootNodeId === "string" && body.rootNodeId ? body.rootNodeId : null;
  const underFolderId = typeof body?.underFolderId === "string" ? body.underFolderId : null;
  if (!frameworkId) return NextResponse.json({ error: "frameworkId required" }, { status: 400 });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] },
    select: { id: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  const project = await prisma.project.findUnique({ where: { id }, select: { folderTree: true } });

  // Select the PCF nodes to mirror as folders.
  //  • With a root: the root + its descendants, `depth` levels deep (relative
  //    to the root). This is what makes the Depth control intuitive.
  //  • Without a root: every node down to the absolute `depth` (Categories = 1).
  let pcfNodes: SeedPcfNode[];
  let absCap = depth; // absolute-level cap passed to folderSeed's filter
  if (rootNodeId) {
    const root = await prisma.pcfNode.findFirst({
      where: { id: rootNodeId, frameworkId },
      select: { id: true, level: true },
    });
    if (!root) return NextResponse.json({ error: "Root node not found" }, { status: 404 });
    absCap = root.level + depth;
    const all = await prisma.pcfNode.findMany({
      where: { frameworkId, active: true, level: { lte: root.level + depth } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: { id: true, hierarchyId: true, name: true, level: true, parentId: true, pcfId: true },
    });
    // BFS from the root through the parent links, keeping only descendants
    // within `depth` levels (root inclusive).
    const childrenByParent = new Map<string, typeof all>();
    for (const n of all) {
      if (!n.parentId) continue;
      (childrenByParent.get(n.parentId) ?? childrenByParent.set(n.parentId, []).get(n.parentId)!).push(n);
    }
    const rootNode = all.find((n) => n.id === rootNodeId);
    const picked: SeedPcfNode[] = [];
    if (rootNode) {
      const queue: (typeof all) = [rootNode];
      while (queue.length) {
        const n = queue.shift()!;
        picked.push(n as SeedPcfNode);
        if (n.level < root.level + depth) queue.push(...(childrenByParent.get(n.id) ?? []));
      }
    }
    pcfNodes = picked;
  } else {
    pcfNodes = await prisma.pcfNode.findMany({
      where: { frameworkId, active: true, level: { lte: depth } },
      orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
      select: { id: true, hierarchyId: true, name: true, level: true, parentId: true, pcfId: true },
    }) as SeedPcfNode[];
  }

  const existing = (project?.folderTree ?? { folders: [], diagramFolderMap: {} }) as unknown as SeedFolderTree;
  const { tree, added } = seedFoldersFromPcf(existing, pcfNodes, { maxLevel: absCap, underFolderId });

  try {
    await prisma.$executeRawUnsafe('UPDATE "Project" SET "folderTree" = $1::jsonb, "updatedAt" = NOW() WHERE id = $2', JSON.stringify(tree), id);
    return NextResponse.json({ ok: true, added });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[POST /api/projects/${id}/pcf/seed-folders]`, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
