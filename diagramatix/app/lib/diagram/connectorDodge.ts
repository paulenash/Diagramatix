import type { Connector, DiagramElement } from "./types";
import { checkSequenceClipsForeignNode } from "./checks/diagramChecks";

/**
 * Slide a sequence connector's vertical run sideways until it no longer passes through an element it is not connected to.
 *
 * Paul, 2026-10-10 (V01.06): the timeout flow from "No carrier confirmation within 24 hours" dropped straight down at x=1322 on its way
 * to a task 230px lower, through "Send appointment confirmation to Customer" (x 1228-1335). There was a clear column just to the
 * right, before the next task. The router builds the L/Z from the event's exit point and never looks at what its vertical run crosses
 * (the long-parked "mid-channel detour" gap), so the repair is made on the finished path, where the answer is certain.
 *
 * Deliberately local and safe:
 *   - only a sequence connector that actually clips something is touched;
 *   - only an INTERIOR vertical segment whose two neighbours are horizontal moves, so both end attachments stay exactly where they are
 *     and the path stays orthogonal;
 *   - candidate columns are the clear edges beside the elements it crosses (14px off), nearest to the original first;
 *   - a candidate is accepted only if the SCANNER's own test (B30) finds the whole path clear — one rule, one place — so it can fix a
 *     clip but never report a different one.
 */
const MARGIN = 14;

export function dodgeForeignNodes(elements: DiagramElement[], connectors: Connector[]): number {
  let fixed = 0;
  const clips = (c: Connector, wps: Connector["waypoints"]) =>
    checkSequenceClipsForeignNode({ elements, connectors: [{ ...c, waypoints: wps }] } as never).length > 0;

  for (const c of connectors) {
    if (c.type !== "sequence" || !Array.isArray(c.waypoints) || c.waypoints.length < 4) continue;
    if (!clips(c, c.waypoints)) continue;
    const w = c.waypoints;
    let done = false;
    // An interior vertical segment i -> i+1 with a horizontal segment on each side.
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
  return fixed;
}
