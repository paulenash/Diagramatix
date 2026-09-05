/**
 * Replay a saved diagram's AI PLAN through the CURRENT layout and report the
 * connector crossings, naming the elements at each end.
 *
 *   npx tsx scripts/report-crossings.ts "path/to/export.json" [more...]
 *
 * Why the plan and not the file: a saved diagram is the OUTPUT, laid out by
 * whatever code shipped the day it was generated. Reading its coordinates
 * measures history. The plan is the input, so replaying it is the only way to
 * ask "what would we draw NOW?" — for free, with no AI call.
 *
 * An export made before plan storage shipped has no plan and simply cannot be
 * retested; it says so rather than quietly measuring the stale coordinates.
 */
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "../app/lib/diagram/bpmnLayout";

interface P { x: number; y: number }

/**
 * Generated plans leave `connectorType` undefined, so a connector is classified
 * by what it JOINS. Reporting a data-object association as a sequence crossing
 * would point the next fix at the wrong rule entirely — one is R8.37's job, the
 * other is the attachment geometry's.
 */
const ARTIFACT = new Set([
  "data-object", "data-store", "data-input", "data-output",
  "text-annotation", "annotation", "prompt-annotation", "review-comment",
]);

/**
 * A MESSAGE FLOW to a black-box pool is not a sequence flow, and it crosses the
 * diagram by design: the pool sits along one edge, so the line to it cuts across
 * whatever lies between. Counting those as crossings drowns the real ones — the
 * first run of this script reported 73 across the corpus, almost all of them
 * message flows behaving exactly as they should.
 */
const BLACK_BOX = new Set(["pool"]);

function segments(pts: P[]): [P, P][] {
  const out: [P, P][] = [];
  for (let i = 1; i < pts.length; i++) out.push([pts[i - 1], pts[i]]);
  return out;
}

/**
 * A proper crossing only. Collinear and endpoint-touching cases are excluded:
 * two flows that meet at a shape, or run along the same channel, are not what
 * Paul is pointing at when he says the lines cross.
 */
function crosses(a: [P, P], b: [P, P]): boolean {
  const side = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const EPS = 0.5;
  const d1 = side(a[0], a[1], b[0]), d2 = side(a[0], a[1], b[1]);
  const d3 = side(b[0], b[1], a[0]), d4 = side(b[0], b[1], a[1]);
  if ([d1, d2, d3, d4].some((d) => Math.abs(d) < EPS)) return false;
  return (d1 > 0) !== (d2 > 0) && (d3 > 0) !== (d4 > 0);
}

for (const file of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan
    ?? j.data?.aiGeneration?.plan ?? j.aiGeneration?.plan ?? j.plan;
  if (!plan?.elements?.length) {
    console.log(`\n${path.basename(file)} — NO PLAN STORED, cannot be retested (regenerate it)`);
    continue;
  }

  const r = layoutBpmnDiagram(plan.elements, plan.connections);
  const byId = new Map<string, { label?: string; type?: string }>(
    (r.elements as { id: string }[]).map((e) => [e.id, e as never]),
  );
  const label = (id: string) => (byId.get(id)?.label ?? id).replace(/\s+/g, " ");
  const isArtifact = (id: string) => ARTIFACT.has(String(byId.get(id)?.type ?? ""));

  type C = { sourceId: string; targetId: string; waypoints?: P[] };
  const all = (r.connectors as C[]).filter((c) => (c.waypoints?.length ?? 0) >= 2);
  const isPool = (id: string) => BLACK_BOX.has(String(byId.get(id)?.type ?? ""));
  const flows = all.filter((c) => !isArtifact(c.sourceId) && !isArtifact(c.targetId)
    && !isPool(c.sourceId) && !isPool(c.targetId));
  const assoc = all.filter((c) => isArtifact(c.sourceId) || isArtifact(c.targetId));

  const scan = (set: C[]) => {
    const out: string[] = [];
    for (let i = 0; i < set.length; i++) {
      for (let k = i + 1; k < set.length; k++) {
        const A = set[i], B = set[k];
        // Two connectors meeting at the same shape are allowed to touch there.
        const ends = new Set([A.sourceId, A.targetId]);
        if (ends.has(B.sourceId) || ends.has(B.targetId)) continue;
        const hit = segments(A.waypoints!).some((sa) => segments(B.waypoints!).some((sb) => crosses(sa, sb)));
        if (hit) out.push(`    "${label(A.sourceId)}" → "${label(A.targetId)}"`
          + `\n      ✕ "${label(B.sourceId)}" → "${label(B.targetId)}"`);
      }
    }
    return out;
  };

  const seq = scan(flows), art = scan(assoc);
  console.log(`\n${path.basename(file)} — ${r.elements.length}el / ${r.connectors.length}conn`);
  console.log(`  ${seq.length} SEQUENCE crossing(s)`);
  seq.forEach((h) => console.log(h));
  console.log(`  ${art.length} ASSOCIATION crossing(s)`);
  art.forEach((h) => console.log(h));
}
