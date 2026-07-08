import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { diffPcfVersions, type DiffNode } from "@/app/lib/pcf/versionDiff";

type Params = { params: Promise<{ id: string; frameworkId: string }> };

/** Resolve the "new" (selected) reference framework + its immediate predecessor
 *  in the same family, plus both node sets. Null if there's nothing to upgrade from. */
async function loadPair(orgId: string, frameworkId: string) {
  const nw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, kind: "reference", OR: [{ orgId: null }, { orgId }] },
    select: { id: true, familyKey: true, variant: true, version: true },
  });
  if (!nw) return null;
  const prev = await prisma.pcfFramework.findFirst({
    where: { familyKey: nw.familyKey, kind: "reference", id: { not: nw.id } },
    orderBy: { createdAt: "desc" },
    select: { id: true, variant: true, version: true },
  });
  if (!prev) return { nw, prev: null, oldNodes: [] as DiffNode[], newNodes: [] as DiffNode[] };
  const [oldNodes, newNodes] = await Promise.all([
    prisma.pcfNode.findMany({ where: { frameworkId: prev.id }, select: { pcfId: true, hierarchyId: true, name: true } }),
    prisma.pcfNode.findMany({ where: { frameworkId: nw.id }, select: { pcfId: true, hierarchyId: true, name: true } }),
  ]);
  return { nw, prev, oldNodes, newNodes };
}

/**
 * GET /api/orgs/[id]/pcf/[frameworkId]/upgrade  — preview.
 * Diff of the selected reference framework vs its predecessor (by stable pcfId),
 * plus the org's usage impact (classifications + tailored nodes on the old
 * version, and how many are orphaned by removals). SuperAdmin OR Owner/Admin.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try { await requireOrgAdminFor(session, await cookies(), id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const pair = await loadPair(id, frameworkId);
  if (!pair) return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  if (!pair.prev) return NextResponse.json({ hasPrevious: false });

  const diff = diffPcfVersions(pair.oldNodes, pair.newNodes);
  const removedPcf = new Set(diff.removed.map((n) => n.pcfId));

  // Usage impact against the OLD version.
  const [classDiagrams, tailoredNodes] = await Promise.all([
    prisma.diagram.findMany({ where: { orgId: id }, select: { id: true, data: true } }),
    prisma.pcfNode.findMany({ where: { sourceFrameworkId: pair.prev.id }, select: { sourcePcfId: true } }),
  ]);
  let classifications = 0, classificationsOrphaned = 0;
  for (const d of classDiagrams) {
    const p = (d.data as { pcf?: { frameworkId?: string; pcfId?: number } } | null)?.pcf;
    if (p?.frameworkId === pair.prev.id) { classifications += 1; if (p.pcfId != null && removedPcf.has(p.pcfId)) classificationsOrphaned += 1; }
  }
  const tailored = tailoredNodes.length;
  const tailoredOrphaned = tailoredNodes.filter((n) => n.sourcePcfId != null && removedPcf.has(n.sourcePcfId)).length;

  const cap = <T,>(a: T[]) => a.slice(0, 200);
  return NextResponse.json({
    hasPrevious: true,
    from: pair.prev, to: pair.nw,
    summary: { added: diff.added.length, removed: diff.removed.length, renamed: diff.renamed.length, unchanged: diff.unchanged },
    added: cap(diff.added), removed: cap(diff.removed), renamed: cap(diff.renamed),
    impact: { classifications, classificationsOrphaned, tailored, tailoredOrphaned },
  });
}

/**
 * POST /api/orgs/[id]/pcf/[frameworkId]/upgrade  — apply.
 * Re-points this org's classifications + tailored-node provenance from the
 * predecessor to the selected version by stable pcfId, refreshing names/codes;
 * removed pcfIds are flagged, not silently broken. SuperAdmin OR Owner/Admin.
 */
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  const { id, frameworkId } = await params;
  try { await requireOrgAdminFor(session, await cookies(), id); }
  catch (err) { if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status }); throw err; }

  const pair = await loadPair(id, frameworkId);
  if (!pair) return NextResponse.json({ error: "Framework not found" }, { status: 404 });
  if (!pair.prev) return NextResponse.json({ error: "No previous version to upgrade from" }, { status: 400 });

  // New node lookup by stable pcfId (need ids/codes/names for re-pointing).
  const newFull = await prisma.pcfNode.findMany({ where: { frameworkId: pair.nw.id }, select: { id: true, pcfId: true, hierarchyId: true, name: true } });
  const newByPcf = new Map(newFull.map((n) => [n.pcfId, n]));

  // 1) Tailored-node provenance: re-point surviving sources to the new version.
  const survivingPcf = [...newByPcf.keys()];
  let tailoredRepointed = 0;
  if (survivingPcf.length > 0) {
    const res = await pgPool.query(
      'UPDATE "PcfNode" SET "sourceFrameworkId" = $1 WHERE "sourceFrameworkId" = $2 AND "sourcePcfId" = ANY($3::int[])',
      [pair.nw.id, pair.prev.id, survivingPcf],
    );
    tailoredRepointed = res.rowCount ?? 0;
  }

  // 2) Diagram classifications: patch data.pcf for this org's diagrams.
  const diagrams = await prisma.diagram.findMany({ where: { orgId: id }, select: { id: true, data: true } });
  let repointed = 0, flaggedRemoved = 0;
  for (const d of diagrams) {
    const data = (d.data ?? {}) as Record<string, unknown>;
    const p = data.pcf as { frameworkId?: string; pcfId?: number } | undefined;
    if (!p || p.frameworkId !== pair.prev.id || p.pcfId == null) continue;
    const nn = newByPcf.get(p.pcfId);
    let next: Record<string, unknown>;
    if (nn) {
      next = { ...p, frameworkId: pair.nw.id, nodeId: nn.id, hierarchyId: nn.hierarchyId, name: nn.name, version: pair.nw.version };
      repointed += 1;
    } else {
      next = { ...p, removedInVersion: pair.nw.version };
      flaggedRemoved += 1;
    }
    await pgPool.query('UPDATE "Diagram" SET data = $1::jsonb WHERE id = $2', [JSON.stringify({ ...data, pcf: next }), d.id]);
  }

  return NextResponse.json({ ok: true, repointed, flaggedRemoved, tailoredRepointed });
}
