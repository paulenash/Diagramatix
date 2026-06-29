/**
 * Connector conformance — the shared net for "is this diagram's wiring clean?",
 * used by BOTH the unit suite (on deterministic layout output) and the AI
 * conformance harness (on live model output). Composes the existing connector
 * checks in diagramChecks.ts and adds the over-segmentation check.
 *
 * Why over-segmentation matters: auto routes are 7 (L-shape) or 8 (vertical jog)
 * waypoints; the editor treats >= 9 as USER-CUSTOMISED and preserves it — it
 * stops re-routing it. So an auto/AI-generated connector with >= 9 waypoints is
 * effectively locked: it shows too many segments AND its endpoints no longer
 * move cleanly (exactly the AI-connector complaints). MAX_AUTO_WAYPOINTS = 8.
 */
import type { DiagramData, Connector } from "@/app/lib/diagram/types";
import {
  type Violation,
  checkReferentialIntegrity,
  checkSequenceClipsForeignNode,
  checkSequenceClipsOwnEndpoint,
  checkDuplicateSequenceConnector,
  checkMessageFlowMoveable,
} from "./diagramChecks";

export const MAX_AUTO_WAYPOINTS = 8;

/** Routed (auto-layout) connector types where the >= 9 preserve-lock applies. */
const ROUTED = new Set<string>(["sequence", "flowline"]);

/** Flag routed connectors carrying more waypoints than an auto route ever
 *  produces — they will be mis-treated as user-customised (locked + over-segmented). */
export function checkConnectorSegments(d: { connectors: Connector[] }): Violation[] {
  const out: Violation[] = [];
  for (const c of d.connectors) {
    if (!ROUTED.has(c.type)) continue;
    const n = c.waypoints?.length ?? 0;
    if (n > MAX_AUTO_WAYPOINTS) {
      out.push({
        rule: "connector-over-segmented",
        severity: "warning",
        ids: [c.id],
        message: `Connector ${c.id} has ${n} waypoints (> ${MAX_AUTO_WAYPOINTS}); the editor will treat it as user-customised and stop re-routing it — too many segments and the endpoints no longer move cleanly.`,
      });
    }
  }
  return out;
}

/**
 * All connector-conformance issues in a finished diagram: dangling endpoints,
 * crossings through foreign nodes, self-clips, duplicate sequence flows,
 * non-moveable message flows, and over-segmented routed connectors.
 */
export function findConnectorConformance(d: DiagramData): Violation[] {
  return [
    ...checkReferentialIntegrity(d),
    ...checkConnectorSegments(d),
    ...checkSequenceClipsForeignNode(d),
    ...checkSequenceClipsOwnEndpoint(d),
    ...checkDuplicateSequenceConnector(d),
    ...checkMessageFlowMoveable(d),
  ];
}

/** Group issues by rule for compact reporting (used by the AI harness log). */
export function summariseConformance(issues: Violation[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const v of issues) by[v.rule] = (by[v.rule] ?? 0) + 1;
  return by;
}
