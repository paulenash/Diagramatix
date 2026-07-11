import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { checkDiagram, RULES, type DiagramLike } from "@/app/lib/diagram/checks/diagramChecks";

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

interface HangingMessageIssue {
  connectorId: string;
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  reason: string;
  severity: "error" | "warning";
}

/** New section — the BPMN-correctness rules ported from the layout-test
 *  harness (containment overflow, merge placement, boundary-on-pool, event-sub
 *  connectors, dangling refs, fabricated wrapper). Generic shape: rule id +
 *  message + severity + involved element ids. */
interface StructuralIssue {
  rule: string;
  message: string;
  severity: "error" | "warning";
  ids: string[];
}

interface DiagramIssue {
  diagramId: string;
  diagramName: string;
  diagramType: string;
  badConnectors: ConnectorIssue[];
  duplicateNames: DuplicateNameIssue[];
  singleLanePools: SingleLanePoolIssue[];
  hangingMessages: HangingMessageIssue[];
  structuralIssues: StructuralIssue[];
}

// Rule id → response bucket. Sourced from the shared registry so the route and
// the rules viewer can never disagree about which rule lands where.
const RULE_CATEGORY = new Map(RULES.map((r) => [r.id, r.category]));

/**
 * GET /api/projects/[id]/scan-pool-connectors
 *
 * Project-wide diagnostic scan. Runs the shared diagram rule registry
 * (app/lib/diagram/checks/diagramChecks.ts) over every diagram and groups the
 * violations into the response sections the UI renders:
 *
 *  1. badConnectors    — sequence/association connectors on a Pool/Lane.
 *  2. duplicateNames   — Pools/Lanes sharing a name in one diagram.
 *  3. singleLanePools  — Pools with exactly one Lane.
 *  4. hangingMessages  — message flows that render badly (error/warning).
 *  5. structuralIssues — BPMN-correctness rules (containment, merge placement,
 *                        boundary-on-pool, event-sub connectors, …).
 *
 * Diagrams with zero issues across all sections are omitted. The exact same
 * rules run in `npm test`, so the in-app scan and the test harness agree.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  let orgId: string;
  try {
    // Edit-or-owner. The scan is a precursor to fixing things; we don't
    // expose it to viewers.
    const access = await requireProjectAccess(session, await cookies(), id, "edit");
    orgId = access.projectOrgId;
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, orgId },
    select: { id: true, name: true, type: true, data: true },
    orderBy: { name: "asc" },
  });

  const result: DiagramIssue[] = [];
  let totalBadConnectors = 0;
  let totalDuplicateGroups = 0;
  let totalSingleLanePools = 0;
  let totalHangingMessages = 0;
  let totalHangingErrors = 0;
  let totalHangingWarnings = 0;
  let totalStructuralIssues = 0;

  for (const d of diagrams) {
    const data = (d.data as unknown as DiagramLike | null) ?? null;
    if (!data || !Array.isArray(data.elements)) continue;

    const badConnectors: ConnectorIssue[] = [];
    const duplicateNames: DuplicateNameIssue[] = [];
    const singleLanePools: SingleLanePoolIssue[] = [];
    const hangingMessages: HangingMessageIssue[] = [];
    const structuralIssues: StructuralIssue[] = [];

    for (const v of checkDiagram({
      elements: data.elements ?? [],
      connectors: data.connectors ?? [],
      // Pass per-diagram font sizes so the B32 header-overrun rule can
      // estimate text width against the rotated header strip. Other
      // rules ignore them. The local DiagramLike here is a route-private
      // type that doesn't carry the font fields, so we cast through
      // unknown to read them from the Prisma JSON payload.
      poolFontSize: (data as unknown as { poolFontSize?: number }).poolFontSize,
      laneFontSize: (data as unknown as { laneFontSize?: number }).laneFontSize,
      // Imported / free-form diagrams: skip the pure-geometry pool + message
      // rules so a faithful foreign layout isn't reported project-wide.
      relaxedLayout: (data as unknown as { relaxedLayout?: boolean }).relaxedLayout,
    })) {
      switch (RULE_CATEGORY.get(v.rule)) {
        case "pool-lane-connector": badConnectors.push(v.data as unknown as ConnectorIssue); break;
        case "duplicate-name": duplicateNames.push(v.data as unknown as DuplicateNameIssue); break;
        case "single-lane-pool": singleLanePools.push(v.data as unknown as SingleLanePoolIssue); break;
        case "hanging-message": hangingMessages.push(v.data as unknown as HangingMessageIssue); break;
        case "bpmn-structure":
          structuralIssues.push({ rule: v.rule, message: v.message, severity: v.severity, ids: v.ids });
          break;
      }
    }

    if (
      badConnectors.length === 0 &&
      duplicateNames.length === 0 &&
      singleLanePools.length === 0 &&
      hangingMessages.length === 0 &&
      structuralIssues.length === 0
    ) continue;

    result.push({
      diagramId: d.id,
      diagramName: d.name,
      diagramType: d.type,
      badConnectors,
      duplicateNames,
      singleLanePools,
      hangingMessages,
      structuralIssues,
    });
    totalBadConnectors += badConnectors.length;
    totalDuplicateGroups += duplicateNames.length;
    totalSingleLanePools += singleLanePools.length;
    totalHangingMessages += hangingMessages.length;
    totalStructuralIssues += structuralIssues.length;
    for (const hm of hangingMessages) {
      if (hm.severity === "warning") totalHangingWarnings++;
      else totalHangingErrors++;
    }
  }

  return NextResponse.json({
    diagrams: result,
    totalBadConnectors,
    totalDuplicateGroups,
    totalSingleLanePools,
    totalHangingMessages,
    totalHangingErrors,
    totalHangingWarnings,
    totalStructuralIssues,
    // Legacy field name kept for compatibility with the existing UI.
    totalBad: totalBadConnectors,
  });
}
