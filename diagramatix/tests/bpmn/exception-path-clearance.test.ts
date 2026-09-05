import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { findLayoutViolations, findReadabilityViolations } from "@/app/lib/diagram/checks/layoutViolations";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/**
 * Paul's item T, on V22.07: "move one attachment point at gateway 'Endorse
 * decline and confirm reasons'".
 *
 * The crossing he could see was the symptom. Underneath, the exception task
 * hanging off a boundary timer — "Escalate approval to the next authority
 * level" — was placed at x=1824 y=1034, directly ON TOP of the gateway
 * "Delegated approver outcome?" at x=1824 y=1053. Two bodies drawn over each
 * other; the gateway's decline branch then squeezed sideways out past its own
 * left edge, and that detour is what crossed the escalation flow.
 *
 * R55.6 could not reach it twice over: it fires only for a boundary event on a
 * SUBPROCESS, and it clears only the event's own host. Here the host is a task
 * and the obstacle is an unrelated gateway further down the main line — which
 * had itself descended into the row the exception path was given.
 *
 * THE REAL PLAN, not a reduction. A hand-built version of this shape was written
 * first and it passed BEFORE the fix as well as after — the collision depends on
 * how the real diagram's columns pack and how far the gateway descends, and a
 * tidy fixture reproduced none of that. A test that cannot fail is worse than no
 * test, so V22.07 joins the corpus and the assertions are made against it.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "V22.07.plan.json");

function laidOut() {
  const j = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const plan = j.diagrams[0].data.aiGeneration.plan;
  return layoutBpmnDiagram(plan.elements, plan.connections);
}

const overlaps = (a: DiagramElement, b: DiagramElement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("R55.7 — an exception path clears whatever is on its row (V22.07, item T)", () => {
  const r = laidOut();
  const by = (id: string) => r.elements.find((e) => e.id === id)!;

  it("T3263 the escalation task is not drawn on top of the decision gateway", () => {
    const esc = by("t_escalate"), gw = by("gw_approver");
    expect(overlaps(esc, gw),
      `escalate (${esc.x},${esc.y} ${esc.width}x${esc.height}) `
      + `overlaps gateway (${gw.x},${gw.y} ${gw.width}x${gw.height})`).toBe(false);
  });

  it("T3264 it clears EVERY element on the main line, not just the first in the way", () => {
    // Clearing the gateway alone lands it on the decline task — which is what
    // the first attempt did, and why the rule iterates rather than nudging once.
    const esc = by("t_escalate");
    for (const id of ["gw_approver", "t_endorse_dec", "t_endorse_app", "t_review"]) {
      expect(overlaps(esc, by(id)), `escalate overlaps ${id}`).toBe(false);
    }
  });

  it("T3265 the gateway's decline branch leaves by its own bottom vertex, not sideways", () => {
    // The symptom Paul reported. Before the fix this route ran (1844,1073) →
    // (1787,1073) → (1787,1193): out past the gateway's own left edge at 1824,
    // which is the signature of a branch detouring around an obstacle.
    const gw = by("gw_approver");
    const branch = r.connectors.find((c) => c.sourceId === "gw_approver" && c.targetId === "t_endorse_dec")!;
    const pts = branch.waypoints ?? [];
    expect(pts.length).toBeGreaterThan(1);
    expect(Math.min(...pts.map((p) => p.x)),
      "the decline branch doubles back past the gateway's left edge").toBeGreaterThanOrEqual(gw.x);
  });

  it("T3266 V22.07 lays out with no readability defect and no sequence crossing", () => {
    const data = { elements: r.elements, connectors: r.connectors } as DiagramData;
    const v = [...findLayoutViolations(data), ...findReadabilityViolations(data)];
    expect(v, v.join("; ")).toEqual([]);
  });
});
