import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { walkForwardClosure } from "@/app/lib/diagram/linkClosure";

// POST /api/bundles/preview
//
// Body: { projectId: string, rootDiagramIds: string[] }
//
// Returns the unioned forward-link closure of the chosen roots plus, for
// every member, whether it's "ready to bundle" (has a currentPublishedVersionId).
// Surfaces cross-project links so the dialog can show the warning checklist
// before the owner commits to creating the bundle.
//
// Gate: caller must be the `diagramOwnerId` of every root they pick.
// (Project ownership is NOT sufficient — same accountability rule as
// per-diagram publishing.)
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const projectId: string | undefined = typeof body.projectId === "string" ? body.projectId : undefined;
  const rootDiagramIds: string[] = Array.isArray(body.rootDiagramIds)
    ? body.rootDiagramIds.filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
    : [];

  if (!projectId || rootDiagramIds.length === 0) {
    return NextResponse.json({ error: "projectId and at least one rootDiagramId required" }, { status: 400 });
  }

  // Verify every root: in the named project AND the caller is its diagramOwner.
  const roots = await prisma.diagram.findMany({
    where: { id: { in: rootDiagramIds } },
    select: { id: true, name: true, type: true, projectId: true, diagramOwnerId: true, lifecycle: true, currentPublishedVersionId: true },
  });
  if (roots.length !== rootDiagramIds.length) {
    return NextResponse.json({ error: "One or more roots not found" }, { status: 404 });
  }
  for (const r of roots) {
    if (r.projectId !== projectId) {
      return NextResponse.json(
        { error: `Diagram '${r.name}' is in a different project; bundles cannot span projects.` },
        { status: 400 },
      );
    }
    if (r.diagramOwnerId !== session.user.id) {
      return NextResponse.json(
        { error: `You are not the Diagram Owner of '${r.name}'. Only the Diagram Owner can publish.` },
        { status: 403 },
      );
    }
  }

  // Walk closure per root, union via Set.
  const allIds = new Set<string>();
  // Aggregate path counts and cross-project links across all roots.
  const aggregatePathCount = new Map<string, number>();
  const crossProjectLinks: Awaited<ReturnType<typeof walkForwardClosure>>["crossProjectLinks"] = [];
  for (const root of roots) {
    const closure = await walkForwardClosure(root.id, projectId, prisma);
    for (const id of closure.diagramIds) allIds.add(id);
    for (const [id, n] of closure.pathCount) {
      aggregatePathCount.set(id, (aggregatePathCount.get(id) ?? 0) + n);
    }
    crossProjectLinks.push(...closure.crossProjectLinks);
  }

  // Hydrate per-member metadata: name, type, lifecycle, version readiness.
  const members = await prisma.diagram.findMany({
    where: { id: { in: Array.from(allIds) } },
    select: {
      id: true,
      name: true,
      type: true,
      lifecycle: true,
      currentPublishedVersionId: true,
      currentPublishedVersion: { select: { versionNumber: true, publishedAt: true } },
    },
  });

  const rootSet = new Set(rootDiagramIds);
  const memberPayload = members.map(m => ({
    diagramId: m.id,
    name: m.name,
    type: m.type,
    lifecycle: m.lifecycle,
    isRoot: rootSet.has(m.id),
    pathCount: aggregatePathCount.get(m.id) ?? 0,
    currentVersion: m.currentPublishedVersion
      ? { versionNumber: m.currentPublishedVersion.versionNumber, publishedAt: m.currentPublishedVersion.publishedAt.toISOString() }
      : null,
    readyToBundle: !!m.currentPublishedVersionId,
  }));

  return NextResponse.json({
    projectId,
    members: memberPayload,
    crossProjectLinks,
    summary: {
      totalMembers: memberPayload.length,
      readyCount: memberPayload.filter(m => m.readyToBundle).length,
      draftCount: memberPayload.filter(m => !m.readyToBundle).length,
      crossProjectLinkCount: crossProjectLinks.length,
    },
  });
}
