import type { Connector, DiagramElement, Point } from "./types";
import { checkSequenceClipsForeignNode } from "./checks/diagramChecks";
import { routeBetweenRocks, rockObstacles, type Dir } from "./routeBetweenRocks";

/**
 * Repair a sequence connector that runs through an element it is not connected to, or that takes an absurdly long way round.
 *
 * Paul, 2026-10-10:
 *  - V01.06: the timeout flow from "No carrier confirmation within 24 hours" dropped straight down through "Send appointment
 *    confirmation to Customer" on its way to a task 230px lower, with a clear column just beside it.
 *  - V01.07: the "otherwise" branch of "Invoice accepted by Customer?" ran 5,000px left and 5,000px back — 10,630px for a 437px job —
 *    because its straight way down was blocked by one task. "A 'navigate between rocks' option should be considered."
 *
 * The router builds the path from the exit point and never looks at what it crosses (the long-parked "mid-channel detour" gap), so the
 * repair is made on the FINISHED path, where the answer is certain. In order of how little they change:
 *   1. slide an interior vertical run sideways to the nearest clear column;
 *   2. navigate between the rocks (routeBetweenRocks.ts): the shortest few-bend route through the gaps between obstacles.
 *
 * Deliberately safe:
 *   - only a connector that clips something, or is more than 2.5x its straight distance + 400px, is touched; a clean one is never moved;
 *   - both end attachments stay exactly where they are and the path stays orthogonal, leaving and arriving perpendicular to the faces;
 *   - a candidate is accepted only if the SCANNER's own test (B30) finds the whole path clear — one rule, one place — so it can fix a
 *     clip but never report a different one; a re-route that is not clearly better (under half the length) is refused unless the
 *     connector was clipping.
 */
const MARGIN = 14;
const ABSURD_FACTOR = 2.5, ABSURD_EXTRA = 400;

const pathLength = (w: Point[]) => w.slice(1).reduce((t, p, i) => t + Math.abs(p.x - w[i].x) + Math.abs(p.y - w[i].y), 0);

/** The direction a leg points, if it is axis-aligned. */
function headingOf(from: Point, to: Point): Dir | null {
  const dx = to.x - from.x, dy = to.y - from.y;
  if (Math.abs(dy) < 0.5 && Math.abs(dx) >= 0.5) return dx > 0 ? "right" : "left";
  if (Math.abs(dx) < 0.5 && Math.abs(dy) >= 0.5) return dy > 0 ? "bottom" : "top";
  return null;
}

export function dodgeForeignNodes(elements: DiagramElement[], connectors: Connector[]): number {
  let fixed = 0;
  const byId = new Map(elements.map(e => [e.id, e]));
  const clips = (c: Connector, wps: Connector["waypoints"]) =>
    checkSequenceClipsForeignNode({ elements, connectors: [{ ...c, waypoints: wps }] } as never).length > 0;

  for (const c of connectors) {
    if (c.type !== "sequence" || !Array.isArray(c.waypoints) || c.waypoints.length < 4) continue;
    const w0 = c.waypoints;
    const s = c.sourceInvisibleLeader ? 1 : 0, e = c.targetInvisibleLeader ? w0.length - 2 : w0.length - 1;
    const visible = w0.slice(s, e + 1);
    if (visible.length < 2) continue;
    const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
    if (!src || !tgt) continue;
    const man = Math.abs(src.x + src.width / 2 - tgt.x - tgt.width / 2) + Math.abs(src.y + src.height / 2 - tgt.y - tgt.height / 2);
    const clipping = clips(c, w0);
    const absurd = pathLength(visible) > ABSURD_FACTOR * man + ABSURD_EXTRA;
    if (!clipping && !absurd) continue;

    // 1. Slide an interior vertical run (a horizontal segment on each side of it) to the nearest clear column.
    let done = false;
    if (clipping) {
      const w = c.waypoints;
      for (let i = 1; i < w.length - 2 && !done; i++) {
        const a = w[i], b = w[i + 1];
        if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) < 20) continue;
        const before = w[i - 1], after = w[i + 2];
        if (Math.abs(before.y - a.y) > 0.5 || Math.abs(after.y - b.y) > 0.5) continue;
        const y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
        const across = elements.filter(o => o.id !== c.sourceId && o.id !== c.targetId && !/^(pool|lane|group|text-annotation)$/.test(o.type)
          && o.y < y2 && y1 < o.y + o.height);
        const cols = [...new Set(across.flatMap(o => [Math.round(o.x - MARGIN), Math.round(o.x + o.width + MARGIN)]))]
          .sort((p, q) => Math.abs(p - a.x) - Math.abs(q - a.x));
        for (const x of cols) {
          const next = w.map((p, k) => (k === i || k === i + 1 ? { ...p, x } : p));
          if (clips(c, next)) continue;
          c.waypoints = next;
          fixed++;
          done = true;
          break;
        }
      }
    }
    if (done && pathLength(c.waypoints.slice(s, c.waypoints.length - (c.targetInvisibleLeader ? 1 : 0))) <= ABSURD_FACTOR * man + ABSURD_EXTRA) continue;

    // 2. Navigate between the rocks. Headings come from the DRAWN first and last legs (the stored sides can be stale).
    const vis = c.waypoints.slice(s, c.waypoints.length - (c.targetInvisibleLeader ? 1 : 0));
    const aDir = headingOf(vis[0], vis[1]);
    const bDir = headingOf(vis[vis.length - 1], vis[vis.length - 2]);   // the outward normal of the face it lands on
    if (!aDir || !bDir) continue;
    const route = routeBetweenRocks(vis[0], aDir, vis[vis.length - 1], bDir, rockObstacles(elements, c.sourceId, c.targetId));
    if (!route || route.length < 2) continue;
    const candidate = [
      ...(c.sourceInvisibleLeader ? [c.waypoints[0]] : []),
      ...route,
      ...(c.targetInvisibleLeader ? [c.waypoints[c.waypoints.length - 1]] : []),
    ];
    if (clips(c, candidate)) continue;
    const stillClipping = clips(c, c.waypoints);
    if (!stillClipping && pathLength(route) > 0.5 * pathLength(vis)) continue;   // not clearly better: leave the existing route alone
    c.waypoints = candidate;
    fixed++;
  }
  return fixed;
}
