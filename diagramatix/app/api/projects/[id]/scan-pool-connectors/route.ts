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

interface DuplicateNameIssue {
  name: string;
  elements: { id: string; type: string }[];
}

interface SingleLanePoolIssue {
  poolId: string;
  poolName: string;
  laneId: string;
  laneName: string;
}

interface DiagramIssue {
  diagramId: string;
  diagramName: string;
  diagramType: string;
  badConnectors: ConnectorIssue[];
  duplicateNames: DuplicateNameIssue[];
  singleLanePools: SingleLanePoolIssue[];
}

/**
 * GET /api/projects/[id]/scan-pool-connectors
 *
 * Project-wide diagnostic scan. For every diagram in the project,
 * surfaces three classes of common issues:
 *
 *  1. Sequence / association connectors whose source or target is a Pool
 *     or Lane (in BPMN these should attach to flow elements, not the
 *     container boundary).
 *  2. Pools or Lanes that share an identical (case-insensitive) label
 *     within the same diagram — typically the result of an import that
 *     created duplicate sibling pools or unrenamed lanes.
 *  3. Pools that have exactly one child Lane — almost always a remnant
 *     of an import pattern where the pool wrapper carried the title and
 *     the lane was left as a single empty band. The user usually wants
 *     the lane absorbed into the pool.
 *
 * Diagrams with zero issues across all three categories are omitted.
 * Response includes per-category totals so the UI can summarise.
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
  let totalBadConnectors = 0;
  let totalDuplicateGroups = 0;
  let totalSingleLanePools = 0;

  for (const d of diagrams) {
    const data = (d.data as Record<string, unknown> | null) ?? null;
    if (!data) continue;
    type ElementLite = { id: string; type: string; label?: string; parentId?: string };
    const elements = (data.elements as ElementLite[] | undefined) ?? [];
    const connectors = (data.connectors as Array<{ id: string; type?: string; sourceId: string; targetId: string }> | undefined) ?? [];

    const byId = new Map<string, ElementLite>();
    for (const e of elements) byId.set(e.id, e);

    // ── Connector issues ──
    const connectorIssues: ConnectorIssue[] = [];
    for (const c of connectors) {
      const cType = (c.type ?? "").toString();
      if (!SEQUENCE_LIKE.has(cType)) continue;
      const src = byId.get(c.sourceId);
      const tgt = byId.get(c.targetId);
      const srcIsContainer = !!src && CONTAINER_TYPES.has(src.type);
      const tgtIsContainer = !!tgt && CONTAINER_TYPES.has(tgt.type);
      if (!srcIsContainer && !tgtIsContainer) continue;
      connectorIssues.push({
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

    // ── Duplicate pool/lane names (case-insensitive, whitespace-insensitive) ──
    // Two pools that look identical to the user can have stored labels
    // that differ only in whitespace — most commonly because the importer
    // auto-wraps long pool labels at different line widths depending on
    // each pool's height, so "Registered Practitioner" in one pool ends
    // up as "Registered\nPractitioner" in another. Collapse every run of
    // whitespace (spaces, tabs, newlines, CR) to a single space before
    // bucketing so visually-identical names match.
    const normaliseName = (s: string) =>
      s.replace(/\s+/g, " ").trim().toLowerCase();
    const nameBuckets = new Map<string, { id: string; type: string }[]>();
    for (const e of elements) {
      if (!CONTAINER_TYPES.has(e.type)) continue;
      const raw = e.label ?? "";
      const key = normaliseName(raw);
      if (!key) continue;
      const list = nameBuckets.get(key) ?? [];
      list.push({ id: e.id, type: e.type });
      nameBuckets.set(key, list);
    }
    const duplicateNames: DuplicateNameIssue[] = [];
    for (const [, list] of nameBuckets) {
      if (list.length < 2) continue;
      // Display the first element's actual label (with whitespace
      // collapsed for readability) so the user sees the name they typed.
      const sampleLabel = elements.find((e) => e.id === list[0].id)?.label ?? "";
      duplicateNames.push({
        name: sampleLabel.replace(/\s+/g, " ").trim(),
        elements: list,
      });
    }

    // ── Pools with exactly one child lane ──
    const lanesByPool = new Map<string, ElementLite[]>();
    for (const e of elements) {
      if (e.type !== "lane") continue;
      const parent = e.parentId ? byId.get(e.parentId) : undefined;
      if (!parent || parent.type !== "pool") continue;
      const list = lanesByPool.get(parent.id) ?? [];
      list.push(e);
      lanesByPool.set(parent.id, list);
    }
    const singleLanePools: SingleLanePoolIssue[] = [];
    for (const [poolId, lanes] of lanesByPool) {
      if (lanes.length !== 1) continue;
      const pool = byId.get(poolId);
      if (!pool) continue;
      singleLanePools.push({
        poolId,
        poolName: pool.label ?? "",
        laneId: lanes[0].id,
        laneName: lanes[0].label ?? "",
      });
    }

    if (connectorIssues.length === 0 && duplicateNames.length === 0 && singleLanePools.length === 0) continue;
    result.push({
      diagramId: d.id,
      diagramName: d.name,
      diagramType: d.type,
      badConnectors: connectorIssues,
      duplicateNames,
      singleLanePools,
    });
    totalBadConnectors += connectorIssues.length;
    totalDuplicateGroups += duplicateNames.length;
    totalSingleLanePools += singleLanePools.length;
  }

  return NextResponse.json({
    diagrams: result,
    totalBadConnectors,
    totalDuplicateGroups,
    totalSingleLanePools,
    // Legacy field name kept for compatibility with the existing UI.
    totalBad: totalBadConnectors,
  });
}
