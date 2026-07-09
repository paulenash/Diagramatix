import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { isSuperuser } from "@/app/lib/superuser";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { addDescriptionAnnotation } from "@/app/lib/pcf/descAnnotation";

type Params = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/[id]/pcf/decompose-folder  { children:[{name,code,pcfId?,linkedDiagramId?}], numbering, description? }
 *
 * Deterministic decomposition driven by the PROJECT'S FOLDER TREE (not the APQC
 * framework): builds Start → a Collapsed Subprocess per given child folder → End,
 * each subprocess pre-linked to its child folder's diagram via
 * properties.linkedDiagramId. Used by SuperAdmin bulk generation so the diagram
 * structure mirrors exactly the folders that were seeded into the project. No AI.
 * SuperAdmin only.
 */
export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const numbering: boolean = !!body?.numbering;
  const description: string = typeof body?.description === "string" ? body.description : "";
  const children = (Array.isArray(body?.children) ? body.children : []) as { name?: string; code?: string; pcfId?: number; linkedDiagramId?: string }[];
  if (children.length === 0) return NextResponse.json({ error: "No child folders provided" }, { status: 400 });

  const elements: AiElement[] = [{ id: "start", type: "start-event", label: "" }];
  const connections: AiConnection[] = [];
  let prev = "start";
  children.forEach((c, i) => {
    const cid = `n_${i}`;
    const name = (c.name ?? "").trim() || `Sub-process ${i + 1}`;
    const label = numbering && c.code ? `${c.code} ${name}` : name;
    const properties: Record<string, unknown> = {};
    if (c.code) properties.pcfHierarchyId = c.code;
    if (c.pcfId != null) properties.pcfId = c.pcfId;
    if (c.linkedDiagramId) properties.linkedDiagramId = c.linkedDiagramId;
    elements.push({ id: cid, type: "subprocess", label, properties });
    connections.push({ sourceId: prev, targetId: cid, type: "sequence" });
    prev = cid;
  });
  elements.push({ id: "end", type: "end-event", label: "" });
  connections.push({ sourceId: prev, targetId: "end", type: "sequence" });

  const diagramData = addDescriptionAnnotation(layoutBpmnDiagram(elements, connections), description);
  return NextResponse.json({ diagramData, childCount: children.length });
}
