/**
 * Two sibling Expanded Subprocesses must never overlap.
 *
 * Paul, 2026-09-13: "AI Generate BPMN: See AI Generation - Meeting Planner
 * Test · Opus 5 (copy).json — Overlapping EPs to be fixed."
 *
 * His diagram has "Plan Meetings" (sp1) and "Plan Discussions Per Meeting"
 * (sp2) as two PARALLEL branches off one gateway, rejoining at a join, both in
 * the same lane. They came out overlapping by 439×70px, with sp2's start event,
 * first task and event drawn inside sp1's box.
 *
 * Replaying the plan on the engine as it stood BEFORE the R55.2 container-
 * scoping fix gives the identical layout — 0 geometry differences — so this is
 * not a regression of that change. It is an older gap: the initial enlargement
 * treats a parallel sibling as DOWNSTREAM and pushes it to the right of the
 * grown EP rather than onto its own row, and the later EP de-overlap skips any
 * sibling that has children — so two EPs are the one pair it never separates.
 *
 * Written BEFORE the fix; fails on today's engine. Asserts the property (two
 * sibling boxes do not intersect), not a coordinate.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const layout = (elements: AiElement[], connections: AiConnection[]) =>
  layoutBpmnDiagram(elements, connections) as DiagramData;

const hit = (a: DiagramElement, b: DiagramElement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Every pair of EPs that overlap and are not one inside the other. */
function siblingEpOverlaps(data: DiagramData): string[] {
  const eps = data.elements.filter((e) => e.type === "subprocess-expanded");
  const out: string[] = [];
  for (let i = 0; i < eps.length; i++) for (let k = i + 1; k < eps.length; k++) {
    const a = eps[i], b = eps[k];
    if (a.parentId === b.id || b.parentId === a.id) continue; // nesting is containment, not collision
    if (!hit(a, b)) continue;
    const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    out.push(`"${a.label}" × "${b.label}" overlap ${ox.toFixed(0)}×${oy.toFixed(0)}px`);
  }
  return out;
}

/** An EP must not have a NON-descendant leaf drawn inside it either. */
function foreignersInsideEps(data: DiagramData): string[] {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const isDesc = (e: DiagramElement, ep: DiagramElement) => {
    let cur: DiagramElement | undefined = e;
    for (let g = 0; cur?.parentId && g < 16; g++) { if (cur.parentId === ep.id) return true; cur = byId.get(cur.parentId); }
    return false;
  };
  const out: string[] = [];
  for (const ep of data.elements.filter((e) => e.type === "subprocess-expanded")) {
    for (const e of data.elements) {
      if (e.id === ep.id || ["pool", "lane", "subprocess-expanded"].includes(e.type)) continue;
      if (isDesc(e, ep) || e.boundaryHostId === ep.id) continue;
      // An event mounted on the rim of one of the EP's OWN descendants sits
      // inside the EP by construction — "X Days Elapsed" is a timer on a
      // collapsed subprocess inside "Invoice Customer". Its parentId is the
      // host's container, not the host, so the descendant walk above misses it.
      const host = e.boundaryHostId ? byId.get(e.boundaryHostId) : undefined;
      if (host && (host.id === ep.id || isDesc(host, ep))) continue;
      if (e.type === "data-object" || e.type === "data-store" || e.type === "text-annotation") continue;
      if (hit(ep, e)) out.push(`${e.type} "${(e.label ?? "").replace(/\s+/g, " ")}" inside "${ep.label}"`);
    }
  }
  return out;
}

/**
 * An EP must be DRAWN inside the lane it belongs to. Paul, same diagram: "Invoice
 * Customer is not shown in the Accountant lane, which it used to be." Its
 * parentId said Accountant; R8.26 had put its top on the gateway's centre line —
 * up in the Meeting Planner lane — and nothing re-fitted lanes afterwards, so
 * logical and visual containment disagreed and the reader saw the visual one.
 */
function epsOutsideTheirLane(data: DiagramData): string[] {
  const byId = new Map(data.elements.map((e) => [e.id, e]));
  const out: string[] = [];
  for (const ep of data.elements.filter((e) => e.type === "subprocess-expanded")) {
    const lane = ep.parentId ? byId.get(ep.parentId) : undefined;
    if (!lane || lane.type !== "lane") continue;
    if (ep.y < lane.y - 0.5 || ep.y + ep.height > lane.y + lane.height + 0.5) {
      out.push(`"${ep.label}" y ${ep.y}..${ep.y + ep.height} is outside lane "${lane.label}" ${lane.y}..${lane.y + lane.height}`);
    }
  }
  return out;
}

/**
 * A lane is as tall as its content, not as tall as where its content USED to
 * be. Paul, second generation: "something pushed the 2 leftmost EP downwards"
 * — R8.26 pulled an EP 233px down from its row to touch the gateway line and
 * the lane kept the top it had been sized for: a 267px empty band. The same
 * rule, acting on a CROSS-lane branch, made the hug grow the neighbouring lane
 * 114px taller than its content to cover the misplacement. The final hug
 * allows about ±½ a task height; 80px is that with room, and a third of the
 * defect.
 */
function laneSlack(data: DiagramData): string[] {
  const out: string[] = [];
  const MAX_SLACK = 80;
  for (const lane of data.elements.filter((e) => e.type === "lane")) {
    const kids = data.elements.filter((e) => e.parentId === lane.id && e.type !== "text-annotation");
    if (!kids.length) continue;
    const top = Math.min(...kids.map((k) => k.y)), bottom = Math.max(...kids.map((k) => k.y + k.height));
    const above = top - lane.y, below = (lane.y + lane.height) - bottom;
    if (above > MAX_SLACK) out.push(`lane "${lane.label}" has ${above.toFixed(0)}px empty above its content`);
    if (below > MAX_SLACK) out.push(`lane "${lane.label}" has ${below.toFixed(0)}px empty below its content`);
  }
  return out;
}

describe("sibling Expanded Subprocesses do not overlap", () => {
  it("T4352 — Paul's real generated plan: no two sibling EPs intersect", () => {
    const file = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "EP02.plan.json");
    const plan = JSON.parse(fs.readFileSync(file, "utf8")).diagrams[0].data.aiGeneration.plan;
    const data = layout(plan.elements, plan.connections);
    expect(data.elements.filter((e) => e.type === "subprocess-expanded").length, "fixture still has EPs").toBeGreaterThan(1);
    expect(siblingEpOverlaps(data)).toEqual([]);
    expect(foreignersInsideEps(data), "another branch's shapes drawn inside an EP").toEqual([]);
    expect(epsOutsideTheirLane(data), "an EP drawn in a lane other than its own").toEqual([]);
  });

  it("T4355 — a branch EP in ANOTHER lane is drawn in that lane, not on the gateway's line", () => {
    // Paul's second generation, after the sibling fix shipped: "No joy". The
    // overlap was gone, but "Invoice Customer" — the Accountant lane's branch
    // off a gateway in the Meeting Planner lane — still sat 126px above its own
    // lane. R8.26 had put its top on the gateway's centre line, which is in the
    // gateway's lane. A cross-lane branch belongs to its OWN lane's stacking
    // (the principle R55 already states); placing it relative to a gateway in
    // another lane is not a placement, it is a lane violation with a rule name.
    const file = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "EP03.plan.json");
    const plan = JSON.parse(fs.readFileSync(file, "utf8")).diagrams[0].data.aiGeneration.plan;
    const data = layout(plan.elements, plan.connections);
    expect(siblingEpOverlaps(data)).toEqual([]);
    expect(epsOutsideTheirLane(data), "an EP drawn in a lane other than its own").toEqual([]);
    expect(foreignersInsideEps(data)).toEqual([]);
    expect(laneSlack(data), "a lane sized for where its content used to be").toEqual([]);
    // Without the cross-lane skip the EP lands in the right lane anyway — but
    // the lane's OTHER work (two tasks and an end event that share its row) is
    // pushed 190px down off that row and the lane grows 114px to fit. Slack
    // above and below stays a tidy 65px either way, so the slack check cannot
    // see it. What it IS: this lane is one row of work, and its content must
    // span no more than its tallest child.
    const invoice = data.elements.find((e) => e.type === "subprocess-expanded" && /Invoice Customer/.test(e.label ?? ""))!;
    expect(invoice, "the fixture still has Invoice Customer").toBeDefined();
    const laneKids = data.elements.filter((e) => e.parentId === invoice.parentId && e.type !== "text-annotation" && !e.boundaryHostId);
    const span = Math.max(...laneKids.map((k) => k.y + k.height)) - Math.min(...laneKids.map((k) => k.y));
    const tallest = Math.max(...laneKids.map((k) => k.height));
    expect(span - tallest, `Invoice Customer's lane should be one row; its content spans ${span}px against a tallest child of ${tallest}px`)
      .toBeLessThanOrEqual(40);
  });

  it("T4353 — three parallel EP branches off one gateway take separate rows", () => {
    // The isolated shape, so a failure names the mechanism. THREE arms, not two:
    // with two, R8.26 hands out the top and bottom vertices and the boxes meet
    // at the centre line without crossing. The third arm leaves from the RIGHT
    // vertex, which R8.26 skips — so that EP stays centred on the line and
    // reaches up into the top arm's box. That is Paul's diagram, reduced.
    const arm = (k: string, tasks: number) => [
      { id: `ep${k}`, type: "subprocess-expanded", label: `Arm ${k}`, pool: "p", lane: "l" },
      { id: `${k}S`, type: "start-event", label: "", parentSubprocess: `ep${k}` },
      ...Array.from({ length: tasks }, (_, i) => ({ id: `${k}${i + 1}`, type: "task", label: `${k} ${i + 1}`, parentSubprocess: `ep${k}` })),
      { id: `${k}E`, type: "end-event", label: "", parentSubprocess: `ep${k}` },
    ];
    const armFlows = (k: string, tasks: number) => {
      const seq = [`${k}S`, ...Array.from({ length: tasks }, (_, i) => `${k}${i + 1}`), `${k}E`];
      return seq.slice(1).map((t, i) => ({ sourceId: seq[i], targetId: t, type: "sequence" }));
    };
    const elements = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "Go", pool: "p", lane: "l" },
      { id: "fork", type: "gateway", label: "All", gatewayType: "parallel", pool: "p", lane: "l" },
      // Arm A mirrors sp1: it holds a NESTED expanded subprocess, so its box is
      // re-wrapped wide LATE — after the enlargement rule has already placed
      // arm B to its right. That late growth is what carries A over B on x;
      // the vertical straddle alone cannot collide.
      { id: "epA", type: "subprocess-expanded", label: "Arm A", pool: "p", lane: "l" },
      { id: "AS", type: "start-event", label: "", parentSubprocess: "epA" },
      { id: "epAin", type: "subprocess-expanded", label: "Repeat until agreed", parentSubprocess: "epA" },
      { id: "inS", type: "start-event", label: "", parentSubprocess: "epAin" },
      { id: "in1", type: "task", label: "Propose", parentSubprocess: "epAin" },
      { id: "in2", type: "task", label: "Confirm", parentSubprocess: "epAin" },
      { id: "inE", type: "end-event", label: "", parentSubprocess: "epAin" },
      { id: "A1", type: "task", label: "A 1", parentSubprocess: "epA" },
      { id: "A2", type: "task", label: "A 2", parentSubprocess: "epA" },
      { id: "AE", type: "end-event", label: "", parentSubprocess: "epA" },
      ...arm("B", 2),
      ...arm("C", 1),
      { id: "join", type: "gateway", label: "Done", gatewayType: "parallel", pool: "p", lane: "l" },
      { id: "e", type: "end-event", label: "End", pool: "p", lane: "l" },
    ] as AiElement[];
    const connections = [
      { sourceId: "s", targetId: "fork", type: "sequence" },
      { sourceId: "fork", targetId: "epA", type: "sequence" },
      { sourceId: "fork", targetId: "epB", type: "sequence" },
      { sourceId: "fork", targetId: "epC", type: "sequence" },
      { sourceId: "AS", targetId: "epAin", type: "sequence" },
      { sourceId: "inS", targetId: "in1", type: "sequence" },
      { sourceId: "in1", targetId: "in2", type: "sequence" },
      { sourceId: "in2", targetId: "inE", type: "sequence" },
      { sourceId: "epAin", targetId: "A1", type: "sequence" },
      { sourceId: "A1", targetId: "A2", type: "sequence" },
      { sourceId: "A2", targetId: "AE", type: "sequence" },
      ...armFlows("B", 2), ...armFlows("C", 1),
      { sourceId: "epA", targetId: "join", type: "sequence" },
      { sourceId: "epB", targetId: "join", type: "sequence" },
      { sourceId: "epC", targetId: "join", type: "sequence" },
      { sourceId: "join", targetId: "e", type: "sequence" },
    ] as AiConnection[];
    const data = layout(elements, connections);
    expect(siblingEpOverlaps(data)).toEqual([]);
    expect(foreignersInsideEps(data)).toEqual([]);
  });

  it("T4354 — a lone EP with a downstream task is still laid out as before", () => {
    // The guard against over-correcting: the ordinary "EP then task" case must
    // keep its right-shift behaviour, not acquire a row it never needed.
    const elements = [
      { id: "p", type: "pool", label: "Co", poolType: "white-box" },
      { id: "l", type: "lane", label: "Team", pool: "p" },
      { id: "s", type: "start-event", label: "Go", pool: "p", lane: "l" },
      { id: "ep", type: "subprocess-expanded", label: "Do work", pool: "p", lane: "l" },
      { id: "iS", type: "start-event", label: "", parentSubprocess: "ep" },
      { id: "t1", type: "task", label: "Inner", parentSubprocess: "ep" },
      { id: "iE", type: "end-event", label: "", parentSubprocess: "ep" },
      { id: "after", type: "task", label: "Afterwards", pool: "p", lane: "l" },
      { id: "e", type: "end-event", label: "End", pool: "p", lane: "l" },
    ] as AiElement[];
    const connections = [
      { sourceId: "s", targetId: "ep", type: "sequence" },
      { sourceId: "iS", targetId: "t1", type: "sequence" },
      { sourceId: "t1", targetId: "iE", type: "sequence" },
      { sourceId: "ep", targetId: "after", type: "sequence" },
      { sourceId: "after", targetId: "e", type: "sequence" },
    ] as AiConnection[];
    const data = layout(elements, connections);
    const ep = data.elements.find((x) => x.id === "ep")!, after = data.elements.find((x) => x.id === "after")!;
    expect(hit(ep, after), "the downstream task must sit clear of the EP").toBe(false);
    expect(after.x, "and to its RIGHT, as a sequential successor").toBeGreaterThanOrEqual(ep.x + ep.width);
    expect(foreignersInsideEps(data)).toEqual([]);
  });
});
