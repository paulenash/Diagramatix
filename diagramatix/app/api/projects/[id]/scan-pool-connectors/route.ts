import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

interface ConnectorIssue {
  connectorId: string;
  type: string;
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  sourceIsContainer: boolean;
  targetIsContainer: boolean;
}

interface DiagramIssue {
  diagramId: string;
  diagramName: string;
  diagramType: string;
  badConnectors: ConnectorIssue[];
}

/**
 * GET /api/projects/[id]/scan-pool-connectors
 *
 * Scans every diagram in the project for SEQUENCE and ASSOCIATION
 * connectors whose source or target endpoint is a Pool or Lane element.
 * Sequence flows and associations should never terminate on a pool/lane
 * boundary in well-formed BPMN — this scan surfaces the cases that
 * "fell through" during a Visio import (or were drawn that way) so the
 * user can open each affected diagram and rewire the endpoint.
 *
 * Response: `{ diagrams: DiagramIssue[], totalBad: number }`.
 * Diagrams with zero issues are omitted from the response.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, userId: session.user.id, orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, orgId },
    select: { id: true, name: true, type: true, data: true },
    orderBy: { name: "asc" },
  });

  const SEQUENCE_LIKE = new Set<string>([
    "sequence", "flow", "associationBPMN", "association",
  ]);
  const CONTAINER_TYPES = new Set<string>(["pool", "lane"]);

  const result: DiagramIssue[] = [];
  let totalBad = 0;

  for (const d of diagrams) {
    const data = (d.data as Record<string, unknown> | null) ?? null;
    if (!data) continue;
    const elements = (data.elements as Array<{ id: string; type: string; label?: string }> | undefined) ?? [];
    const connectors = (data.connectors as Array<{ id: string; type?: string; sourceId: string; targetId: string }> | undefined) ?? [];
    if (connectors.length === 0) continue;

    const byId = new Map<string, { id: string; type: string; label?: string }>();
    for (const e of elements) byId.set(e.id, e);

    const issues: ConnectorIssue[] = [];
    for (const c of connectors) {
      const cType = (c.type ?? "").toString();
      if (!SEQUENCE_LIKE.has(cType)) continue;
      const src = byId.get(c.sourceId);
      const tgt = byId.get(c.targetId);
      const srcIsContainer = !!src && CONTAINER_TYPES.has(src.type);
      const tgtIsContainer = !!tgt && CONTAINER_TYPES.has(tgt.type);
      if (!srcIsContainer && !tgtIsContainer) continue;
      issues.push({
        connectorId: c.id,
        type: cType,
        sourceName: src?.label ?? src?.type ?? "(unknown)",
        sourceType: src?.type ?? "(unknown)",
        targetName: tgt?.label ?? tgt?.type ?? "(unknown)",
        targetType: tgt?.type ?? "(unknown)",
        sourceIsContainer: srcIsContainer,
        targetIsContainer: tgtIsContainer,
      });
    }
    if (issues.length > 0) {
      result.push({
        diagramId: d.id,
        diagramName: d.name,
        diagramType: d.type,
        badConnectors: issues,
      });
      totalBad += issues.length;
    }
  }

  return NextResponse.json({ diagrams: result, totalBad });
}
