/**
 * T4833 — every GENERATED message label is placed by Paul's rule.
 *
 * Paul, 2026-09-25: "The message lable should always be in the air gap between
 * pools and attached closest to the Pool meesage endpoint diagonally to the
 * left or right" — asked whether that covers AI-generated diagrams: "Always —
 * generated too". That supersedes the June R05.05 / R05.09 rule, which centred
 * a generated label ON its line.
 *
 * Checked over the whole layout corpus (real AI plans, laid out by the real
 * engine), measured independently of messageLabel.ts: the box the canvas draws
 * lies in the air gap next to the message's POOL end, its near side is 10px off
 * that pool's edge — or a whole number of rows further in, where a row was
 * taken — it is not drawn across its own line, and no other message's line
 * runs between it and its own (so it never reads as a neighbour's name).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { connectorLabelBox } from "@/app/lib/diagram/checks/layoutViolations";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".plan.json")) : [];

const EDGE = 10, ROW = 2;

const visible = (c: Connector) => {
  const w = c.waypoints;
  return w.slice(c.sourceInvisibleLeader ? 1 : 0, c.targetInvisibleLeader ? w.length - 1 : w.length);
};

/** The x of every OTHER message's vertical line that runs through rows y0–y1. */
function otherLinesAt(c: Connector, all: Connector[], y0: number, y1: number): number[] {
  const xs: number[] = [];
  for (const o of all) {
    if (o.id === c.id || o.type !== "messageBPMN") continue;
    const v = visible(o);
    for (let i = 1; i < v.length; i++) {
      const a = v[i - 1], b = v[i];
      if (Math.abs(a.x - b.x) > 0.5) continue;
      if (Math.max(a.y, b.y) <= y0 + 0.01 || Math.min(a.y, b.y) >= y1 - 0.01) continue;
      xs.push(a.x);
    }
  }
  return xs;
}

/** What is wrong with one message's label, or null. `skip` when there is no air gap to judge. */
function judge(c: Connector, els: DiagramElement[], all: Connector[]): string | null | "skip" {
  const byId = new Map(els.map((e) => [e.id, e] as const));
  const src = byId.get(c.sourceId), tgt = byId.get(c.targetId);
  if (!src || !tgt) return "skip";
  const bb = (e: DiagramElement) => (e.properties?.poolType as string | undefined) === "black-box";
  let fromPool: boolean;
  if (src.type === "pool" && tgt.type === "pool") fromPool = !(bb(tgt) && !bb(src));
  else if (src.type === "pool") fromPool = true;
  else if (tgt.type === "pool") fromPool = false;
  else return "skip";
  const pool = fromPool ? src : tgt;
  const vis = visible(c);
  const at = fromPool ? vis[0] : vis[vis.length - 1];
  const other = fromPool ? vis[vis.length - 1] : vis[0];
  let below: boolean;
  if (other.y >= pool.y + pool.height - 0.5) below = true;
  else if (other.y <= pool.y + 0.5) below = false;
  else return "skip";
  const edge = below ? pool.y + pool.height : pool.y;
  let far: number | null = null;
  for (const p of els) {
    if (p.type !== "pool" || p.id === pool.id || at.x < p.x || at.x > p.x + p.width) continue;
    const face = below ? p.y : p.y + p.height;
    if (below ? face < edge : face > edge) continue;
    if (far === null || (below ? face < far : face > far)) far = face;
  }
  if (far === null) far = other.y;
  const lo = Math.min(edge, far), hi = Math.max(edge, far);
  const box = connectorLabelBox(c, els);
  if (!box) return "the label has no box";
  const name = `"${c.label}"`;
  if (box.y < lo - 0.01 || box.y + box.h > hi + 0.01) {
    if (hi - lo >= box.h) return `${name} is outside its air gap [${lo.toFixed(1)}, ${hi.toFixed(1)}]: ${box.y.toFixed(1)}–${(box.y + box.h).toFixed(1)}`;
  }
  if (hi - lo >= EDGE + box.h) {
    const dist = below ? box.y - edge : edge - (box.y + box.h);
    const row = (dist - EDGE) / (box.h + ROW);
    if (Math.abs(row - Math.round(row)) > 1e-6 || row < -1e-6) return `${name} is not attached: ${dist.toFixed(1)}px off its pool's edge`;
  }
  if (box.x < at.x - 0.01 && box.x + box.w > at.x + 0.01) return `${name} is drawn across its own line`;
  // Its own line is the nearest message line: no other message's line runs
  // between the label and its own. A label stepped out along its row (more
  // than 6px off its line) may not have one through it either — there it would
  // read as that message's name. (An attached label with a neighbour's line
  // through it is the least-overlap fallback, where no clear spot exists.)
  const left = box.x + box.w <= at.x + 0.01;
  const nearSide = left ? box.x + box.w : box.x;
  const farSide = left ? box.x : box.x + box.w;
  const steppedOut = Math.abs(nearSide - at.x) > 6 + 0.01;
  const reach = steppedOut ? farSide : nearSide;
  const x0 = Math.min(at.x, reach), x1 = Math.max(at.x, reach);
  const between = otherLinesAt(c, all, box.y, box.y + box.h).filter((x) => x > x0 + 0.01 && x < x1 - 0.01);
  if (between.length) {
    return `${name} is nearer another message's line (x ${between[0].toFixed(1)}) than its own (x ${at.x.toFixed(1)})`;
  }
  return null;
}

describe("T4833 — generated message labels: in the air gap, attached at the pool end, beside their line", () => {
  it("across the layout corpus, every labelled message", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
    const wrong: string[] = [];
    let judged = 0;
    for (const f of files) {
      const j = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));
      const plan = j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan;
      const out = layoutBpmnDiagram(plan.elements, plan.connections);
      for (const c of out.connectors) {
        if (c.type !== "messageBPMN" || !(c.label ?? "").trim()) continue;
        const v = judge(c, out.elements, out.connectors);
        if (v === "skip") continue;
        judged++;
        if (v) wrong.push(`${f}: ${v}`);
      }
    }
    // The corpus must actually contain messages to judge, or this proves nothing.
    expect(judged).toBeGreaterThan(20);
    expect(wrong).toEqual([]);
  });
});
