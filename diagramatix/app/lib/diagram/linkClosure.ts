import type { PrismaClient } from "@/app/generated/prisma/client";

// Element types that may carry `properties.linkedDiagramId` and therefore
// participate in the forward-link graph. Anchored here so both this
// closure walker and the legacy scan-links route (project link audit)
// agree on what counts as a link-bearing element.
//
// • subprocess / subprocess-expanded — BPMN drill-into-child-process.
// • submachine                       — State-machine drill-into-sub-machine.
// • chevron-collapsed                — Value-chain drill-into-detailed-process.
// • use-case                         — Process Context central process
//                                      drill-into-detailed BPMN.
// • archimate-shape                  — ArchiMate Business Process drill-into
//                                      the linked BPMN diagram.
export const LINK_BEARING_ELEMENT_TYPES: ReadonlySet<string> = new Set([
  "subprocess",
  "subprocess-expanded",
  "submachine",
  "chevron-collapsed",
  "use-case",
  "archimate-shape",
]);

// Lightweight element shape used by the link-extraction helper. Mirrors
// the actual DiagramData element type's link-relevant fields only — keep
// the rest opaque so this utility doesn't drag the full type graph in.
interface ElementLite {
  id: string;
  type: string;
  properties?: Record<string, unknown> | null;
}

// Same lightweight shape for the diagram's data blob. Anything outside
// `elements` is irrelevant to the link graph.
interface DiagramDataLite {
  elements?: ElementLite[];
}

// One forward-link discovered inside a diagram. `fromElementId` is
// surfaced so the stale-closure UI can point owners at the offending
// element when a cross-project link blocks publish.
export interface ForwardLink {
  fromDiagramId: string;
  fromElementId: string;
  targetDiagramId: string;
}

// A link that points to a diagram outside the closure's project. Surfaced
// to the publish dialog as a checklist of "dead-end" links the audience
// will see.
export interface CrossProjectLink {
  fromDiagramId: string;
  fromElementId: string;
  targetDiagramId: string;
  targetProjectId: string | null;
  targetName: string;
}

// Result of `walkForwardClosure`.
export interface LinkClosureResult {
  /** Root + every descendant reachable via in-project link traversal. */
  diagramIds: string[];
  /** How many distinct in-project paths reach each diagram. Useful for the
   *  "stale closure" UI ("this subprocess is reached by 3 chains"). */
  pathCount: Map<string, number>;
  /** Links from in-closure diagrams that point OUT of the closure's
   *  project. Walker does NOT enqueue these — bundles are project-scoped. */
  crossProjectLinks: CrossProjectLink[];
}

// Safety cap on traversal depth. A real BPMN hierarchy is rarely past
// 50 nodes; 500 is a runaway guard for cycles or pathological diagrams.
const TRAVERSAL_CAP = 500;

/** Pull every forward-link out of a diagram's data payload. Shared with
 *  the legacy scan-links route so both consumers agree on which element
 *  types and which `properties.linkedDiagramId` shape count. */
export function extractForwardLinks(
  fromDiagramId: string,
  data: unknown,
): ForwardLink[] {
  if (!data || typeof data !== "object") return [];
  const elements = (data as DiagramDataLite).elements ?? [];
  const out: ForwardLink[] = [];
  for (const el of elements) {
    if (!LINK_BEARING_ELEMENT_TYPES.has(el.type)) continue;
    const linkedId = el.properties?.linkedDiagramId;
    if (typeof linkedId !== "string" || linkedId.length === 0) continue;
    out.push({
      fromDiagramId,
      fromElementId: el.id,
      targetDiagramId: linkedId,
    });
  }
  return out;
}

/** BFS from `rootDiagramId`, staying inside `projectId`. Links that hop
 *  out of the project are recorded as `crossProjectLinks` for the publish
 *  dialog's cross-project warning, but the walker does NOT enqueue them.
 *  Cycle-safe via a visited set; capped at TRAVERSAL_CAP for safety.
 *
 *  Pre-fetches every diagram in the project once so the BFS is N+1 queries
 *  per cross-project link, not per node.
 */
export async function walkForwardClosure(
  rootDiagramId: string,
  projectId: string,
  prisma: PrismaClient,
): Promise<LinkClosureResult> {
  // Pre-fetch every diagram in the project. We only need id + data; the
  // rest of the row is irrelevant to link extraction.
  const projectDiagrams = await prisma.diagram.findMany({
    where: { projectId },
    select: { id: true, data: true },
  });
  const projectById = new Map<string, { data: unknown }>();
  for (const d of projectDiagrams) {
    projectById.set(d.id, { data: d.data });
  }

  // Guard: root must actually live in the project. Caller-side responsibility,
  // but a defence-in-depth check costs nothing.
  if (!projectById.has(rootDiagramId)) {
    return { diagramIds: [], pathCount: new Map(), crossProjectLinks: [] };
  }

  const visited = new Set<string>();
  const pathCount = new Map<string, number>();
  const crossProjectLinks: CrossProjectLink[] = [];
  const queue: string[] = [rootDiagramId];

  // Cache projectId lookups for cross-project targets so we don't hit the
  // DB twice for the same one.
  const crossProjectCache = new Map<
    string,
    { projectId: string | null; name: string } | null
  >();

  while (queue.length > 0 && visited.size < TRAVERSAL_CAP) {
    const cur = queue.shift()!;
    if (visited.has(cur)) continue;
    visited.add(cur);

    const entry = projectById.get(cur);
    if (!entry) continue; // shouldn't happen — guarded above + filtered in-project below
    const links = extractForwardLinks(cur, entry.data);
    for (const link of links) {
      if (projectById.has(link.targetDiagramId)) {
        // In-project hop: track the path count even when already visited
        // so the "reached by N chains" UI is accurate.
        pathCount.set(
          link.targetDiagramId,
          (pathCount.get(link.targetDiagramId) ?? 0) + 1,
        );
        if (!visited.has(link.targetDiagramId)) {
          queue.push(link.targetDiagramId);
        }
      } else {
        // Cross-project hop: resolve the target's project + name once,
        // even if the same external diagram is referenced from many places.
        let resolved = crossProjectCache.get(link.targetDiagramId);
        if (resolved === undefined) {
          const target = await prisma.diagram.findUnique({
            where: { id: link.targetDiagramId },
            select: { projectId: true, name: true },
          });
          resolved = target
            ? { projectId: target.projectId, name: target.name }
            : null;
          crossProjectCache.set(link.targetDiagramId, resolved);
        }
        crossProjectLinks.push({
          fromDiagramId: link.fromDiagramId,
          fromElementId: link.fromElementId,
          targetDiagramId: link.targetDiagramId,
          targetProjectId: resolved?.projectId ?? null,
          targetName: resolved?.name ?? "(unknown diagram)",
        });
      }
    }
  }

  return {
    diagramIds: Array.from(visited),
    pathCount,
    crossProjectLinks,
  };
}
