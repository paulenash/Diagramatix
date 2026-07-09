import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { addDescriptionAnnotation } from "@/app/lib/pcf/descAnnotation";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/pcf/decompose  { frameworkId, nodeId, numbering }
 *
 * Deterministic APQC decomposition (no AI): when a node ABOVE the lowest
 * (Task) level is chosen, each of its direct APQC child activities becomes a
 * Collapsed Subprocess laid out Start → [subprocess…] → End. Optionally
 * prefixes each label with the child's APQC code (numbering).
 *
 * Returns { empty: true } when the node is a leaf (Task level / no children)
 * so the caller falls back to AI generation for a detailed task-level model.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  let projectOrgId: string;
  try {
    ({ projectOrgId } = await requireProjectAccess(session, await cookies(), id, "edit"));
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({}));
  const frameworkId: string = body.frameworkId ?? "";
  const nodeId: string = body.nodeId ?? "";
  const numbering: boolean = !!body.numbering;
  if (!frameworkId || !nodeId) return NextResponse.json({ error: "frameworkId and nodeId are required" }, { status: 400 });

  const fw = await prisma.pcfFramework.findFirst({
    where: { id: frameworkId, OR: [{ orgId: null }, { orgId: projectOrgId }] },
    select: { id: true, name: true, variant: true, version: true },
  });
  if (!fw) return NextResponse.json({ error: "Framework not found" }, { status: 404 });

  const node = await prisma.pcfNode.findFirst({
    where: { id: nodeId, frameworkId },
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true, description: true },
  });
  if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });

  const children = await prisma.pcfNode.findMany({
    where: { frameworkId, parentId: nodeId, active: true },
    orderBy: { sortOrder: "asc" },
    take: 200,
    select: { id: true, pcfId: true, hierarchyId: true, name: true, level: true },
  });

  // Leaf (Task level, or simply no modelled children) → let the caller AI-generate.
  if (children.length === 0) {
    return NextResponse.json({ empty: true, node });
  }

  // R8-style deterministic layout: Start → collapsed subprocess per child → End.
  const elements: AiElement[] = [{ id: "start", type: "start-event", label: "" }];
  const connections: AiConnection[] = [];
  let prev = "start";
  for (const c of children) {
    const cid = `n_${c.id}`;
    elements.push({
      id: cid,
      type: "subprocess", // collapsed subprocess
      label: numbering ? `${c.hierarchyId} ${c.name}` : c.name,
      properties: { pcfId: c.pcfId, pcfHierarchyId: c.hierarchyId },
    });
    connections.push({ sourceId: prev, targetId: cid, type: "sequence" });
    prev = cid;
  }
  elements.push({ id: "end", type: "end-event", label: "" });
  connections.push({ sourceId: prev, targetId: "end", type: "sequence" });

  const diagramData = addDescriptionAnnotation(layoutBpmnDiagram(elements, connections), node.description);

  return NextResponse.json({
    diagramData,
    node,
    framework: fw,
    childCount: children.length,
  });
}
