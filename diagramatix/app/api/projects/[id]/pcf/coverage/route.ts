import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { computePcfCoverage, type CoverageNodeIn, type Classification } from "@/app/lib/pcf/coverage";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/[id]/pcf/coverage
 * APQC PCF coverage for the project's linked framework (Project.pcf): of the
 * PCF nodes in scope (whole framework, or the linked root branch), which are
 * modelled by a diagram classified against them. View access.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "view"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { pcf: true, diagrams: { select: { id: true, name: true, data: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const pcf = (project.pcf ?? {}) as { frameworkId?: string; rootNodeId?: string; variant?: string; version?: string; frameworkName?: string; rootHierarchyId?: string; rootName?: string };
  if (!pcf.frameworkId) return NextResponse.json({ error: "No APQC framework linked to this project" }, { status: 400 });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: pcf.frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] },
    select: { id: true, name: true, variant: true, version: true },
  });
  if (!fw) return NextResponse.json({ error: "Linked framework not found" }, { status: 404 });

  const allNodes = await prisma.pcfNode.findMany({
    where: { frameworkId: fw.id, active: true },
    orderBy: [{ level: "asc" }, { sortOrder: "asc" }],
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true, parentId: true },
  });

  // Scope to the linked root branch if one is set.
  let scope: CoverageNodeIn[] = allNodes;
  if (pcf.rootNodeId && allNodes.some((n) => n.id === pcf.rootNodeId)) {
    const childrenByParent = new Map<string, typeof allNodes>();
    for (const n of allNodes) {
      if (!n.parentId) continue;
      (childrenByParent.get(n.parentId) ?? childrenByParent.set(n.parentId, []).get(n.parentId)!).push(n);
    }
    const root = allNodes.find((n) => n.id === pcf.rootNodeId)!;
    const picked: typeof allNodes = [];
    const queue = [root];
    while (queue.length) {
      const n = queue.shift()!;
      picked.push(n);
      queue.push(...(childrenByParent.get(n.id) ?? []));
    }
    scope = picked;
  }

  // Read each diagram's classification from DiagramData.pcf.
  const classifications: Classification[] = [];
  for (const d of project.diagrams) {
    const dp = (d.data as { pcf?: { nodeId?: string; pcfId?: number; frameworkId?: string } } | null)?.pcf;
    if (dp && (dp.nodeId || dp.pcfId != null)) {
      classifications.push({ nodeId: dp.nodeId, pcfId: dp.pcfId, frameworkId: dp.frameworkId, diagramId: d.id, diagramName: d.name });
    }
  }

  const coverage = computePcfCoverage(scope, classifications, fw.id);
  return NextResponse.json({
    framework: fw,
    root: pcf.rootNodeId ? { hierarchyId: pcf.rootHierarchyId, name: pcf.rootName } : null,
    ...coverage,
  });
}
