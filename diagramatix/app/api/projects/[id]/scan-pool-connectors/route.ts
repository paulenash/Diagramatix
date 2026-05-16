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

interface HangingMessageIssue {
  connectorId: string;
  sourceName: string;
  sourceType: string;
  targetName: string;
  targetType: string;
  reason: string;
  /** "error" — one of:
   *   • message has no horizontal overlap between source and target (broken)
   *   • message touches a white-box pool that has NO children
   *     (pool is misclassified — should be black-box).
   *  "warning" — message is attached directly to the boundary of a
   *  white-box pool that DOES have children. Technically allowed in some
   *  BPMN styles but flagged because the user usually meant to attach to
   *  a flow element inside the pool, not to the pool boundary itself.
   *  Messages running between flow elements *inside* white-box pools are
   *  NOT flagged. */
  severity: "error" | "warning";
}

interface DiagramIssue {
  diagramId: string;
  diagramName: string;
  diagramType: string;
  badConnectors: ConnectorIssue[];
  duplicateNames: DuplicateNameIssue[];
  singleLanePools: SingleLanePoolIssue[];
  hangingMessages: HangingMessageIssue[];
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
  let totalHangingMessages = 0;
  let totalHangingErrors = 0;
  let totalHangingWarnings = 0;

  for (const d of diagrams) {
    const data = (d.data as Record<string, unknown> | null) ?? null;
    if (!data) continue;
    type ElementLite = {
      id: string; type: string; label?: string; parentId?: string;
      x?: number; y?: number; width?: number; height?: number;
      properties?: { poolType?: string };
    };
    const elements = (data.elements as ElementLite[] | undefined) ?? [];
    type ConnectorLite = {
      id: string; type?: string; sourceId: string; targetId: string;
      sourceSide?: "top" | "right" | "bottom" | "left";
      targetSide?: "top" | "right" | "bottom" | "left";
    };
    const connectors = (data.connectors as ConnectorLite[] | undefined) ?? [];

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

    // ── Hanging Messages (messageBPMN connectors rendered red on canvas) ──
    // Three patterns are surfaced:
    //   1. ERROR — the message is attached to the boundary of a pool
    //      that is marked white-box but has NO child elements. A
    //      white-box pool with no contents is a misclassification — it
    //      should be black-box. The importer now prevents this, but the
    //      scan still flags it (catches diagrams that pre-date the fix
    //      or were edited by hand).
    //   2. WARNING — the message endpoint IS a white-box pool element
    //      that DOES have children. Technically allowed in some BPMN
    //      styles but usually the user meant to attach to a flow
    //      element inside the pool. Messages between flow elements
    //      *inside* white-box pools are NOT flagged.
    //   3. ERROR — no x-axis overlap between source and target shapes
    //      (message can't render cleanly; almost always broken).
    const hangingMessages: HangingMessageIssue[] = [];
    // Pre-compute, per pool, whether it has any child elements (any
    // element whose parentId points at the pool, including lanes).
    const poolHasChildren = new Map<string, boolean>();
    for (const e of elements) {
      if (!e.parentId) continue;
      const parent = byId.get(e.parentId);
      if (!parent || parent.type !== "pool") continue;
      poolHasChildren.set(parent.id, true);
    }
    // Find the containing pool of an element (or the element itself if it
    // IS a pool / has no pool ancestor). Walks up the parentId chain so
    // tasks inside lanes inside pools resolve correctly. The returned bbox
    // is the reference frame for "above/below" comparisons in the
    // misconnected-message check below.
    const getContainerBox = (el: ElementLite): { x: number; y: number; w: number; h: number } | null => {
      if (
        typeof el.x !== "number" || typeof el.y !== "number" ||
        typeof el.width !== "number" || typeof el.height !== "number"
      ) return null;
      let cur: ElementLite | undefined = el;
      while (cur?.parentId) {
        const p = byId.get(cur.parentId);
        if (!p) break;
        if (p.type === "pool" &&
            typeof p.x === "number" && typeof p.y === "number" &&
            typeof p.width === "number" && typeof p.height === "number") {
          return { x: p.x, y: p.y, w: p.width, h: p.height };
        }
        cur = p;
      }
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    };
    for (const c of connectors) {
      if ((c.type ?? "") !== "messageBPMN") continue;
      const src = byId.get(c.sourceId);
      const tgt = byId.get(c.targetId);
      if (!src || !tgt) continue;
      const srcIsWhitePool =
        src.type === "pool" && (src.properties?.poolType ?? "") === "white-box";
      const tgtIsWhitePool =
        tgt.type === "pool" && (tgt.properties?.poolType ?? "") === "white-box";
      let reason = "";
      let severity: "error" | "warning" = "error";
      if (srcIsWhitePool || tgtIsWhitePool) {
        // Identify which side is the offending white-box pool. If BOTH
        // are, prefer the one without children for the error message.
        const srcEmpty = srcIsWhitePool && !poolHasChildren.get(src.id);
        const tgtEmpty = tgtIsWhitePool && !poolHasChildren.get(tgt.id);
        if (srcEmpty || tgtEmpty) {
          reason = "white-box pool has no contents — should be black-box";
          severity = "error";
        } else {
          reason = "message is attached to white-box pool";
          severity = "warning";
        }
      } else if (
        typeof src.x === "number" && typeof src.width === "number" &&
        typeof tgt.x === "number" && typeof tgt.width === "number"
      ) {
        const overlapMax = Math.min(src.x + src.width, tgt.x + tgt.width);
        const overlapMin = Math.max(src.x, tgt.x);
        if (overlapMax <= overlapMin) {
          reason = "no x-axis overlap between source and target";
          severity = "error";
        }
      }
      // ── Misconnected message (top/bottom edge facing the wrong way) ──
      // Independent of the above — a message can have x-axis overlap and
      // still be attached to the wrong vertical edge. For each end of the
      // connector whose attachment side is top or bottom, the OTHER end's
      // centre must lie on the matching side of THIS end's container pool
      // (or of THIS end's own bbox if it has no pool ancestor / is itself
      // a pool). Mismatch → misconnected.
      //
      // Per spec:
      //   • Top-attached on a task: other end must be ABOVE the task's
      //     containing pool. If below → misconnected.
      //   • Bottom-attached on a task: other end must be BELOW the task's
      //     containing pool. If above → misconnected.
      //   • Top-attached on a pool: other end must be ABOVE this pool.
      //   • Bottom-attached on a pool: other end must be BELOW this pool.
      // Y axis here is screen-style (smaller Y = above).
      if (!reason) {
        const checkEnd = (
          endEl: ElementLite,
          endSide: "top" | "right" | "bottom" | "left" | undefined,
          otherEl: ElementLite,
        ): string | null => {
          if (endSide !== "top" && endSide !== "bottom") return null;
          const box = getContainerBox(endEl);
          if (!box) return null;
          if (
            typeof otherEl.y !== "number" || typeof otherEl.height !== "number"
          ) return null;
          const otherCenterY = otherEl.y + otherEl.height / 2;
          if (endSide === "top" && otherCenterY > box.y + box.h) {
            return endEl.type === "pool"
              ? "message attached to top of pool but other end is below"
              : "message attached to top of element but other end is below the containing pool";
          }
          if (endSide === "bottom" && otherCenterY < box.y) {
            return endEl.type === "pool"
              ? "message attached to bottom of pool but other end is above"
              : "message attached to bottom of element but other end is above the containing pool";
          }
          return null;
        };
        const srcReason = checkEnd(src, c.sourceSide, tgt);
        const tgtReason = srcReason ? null : checkEnd(tgt, c.targetSide, src);
        const msg = srcReason ?? tgtReason;
        if (msg) {
          reason = msg;
          severity = "error";
        }
      }
      if (!reason) continue;
      hangingMessages.push({
        connectorId: c.id,
        sourceName: src.label ?? src.type,
        sourceType: src.type,
        targetName: tgt.label ?? tgt.type,
        targetType: tgt.type,
        reason,
        severity,
      });
    }

    if (
      connectorIssues.length === 0 &&
      duplicateNames.length === 0 &&
      singleLanePools.length === 0 &&
      hangingMessages.length === 0
    ) continue;
    result.push({
      diagramId: d.id,
      diagramName: d.name,
      diagramType: d.type,
      badConnectors: connectorIssues,
      duplicateNames,
      singleLanePools,
      hangingMessages,
    });
    totalBadConnectors += connectorIssues.length;
    totalDuplicateGroups += duplicateNames.length;
    totalSingleLanePools += singleLanePools.length;
    totalHangingMessages += hangingMessages.length;
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
    // Legacy field name kept for compatibility with the existing UI.
    totalBad: totalBadConnectors,
  });
}
