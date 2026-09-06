import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramElement } from "@/app/lib/diagram/types";

/**
 * Paul, 2026-09-06 on V22.01: "End event on top of gateway."
 *
 * "Notification held incomplete" terminates the branch out of "Record
 * Notification As Incomplete", two rows below — but it had been left on the
 * MIDDLE row, in the same column as the decision "Duplicate of an existing
 * claim?". That gateway is then centred on the vertical span of its own two
 * branches, which is Paul's own rule (a gateway sits on its branches' mid-line),
 * and the centring moved it straight onto the End event.
 *
 * So the gateway was right and the End event was wrong. R8.38 repairs it: an End
 * event terminates ONE flow and belongs on the line it terminates, and being
 * anywhere else is what let something else be centred on top of it.
 */
const FIXTURE = path.join(process.cwd(), "tests", "fixtures", "layout-corpus", "V22.01b.plan.json");

function laidOut() {
  const j = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const plan = j.diagrams[0].data.aiGeneration.plan;
  return layoutBpmnDiagram(plan.elements, plan.connections);
}
const hits = (a: DiagramElement, b: DiagramElement) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

describe("R8.38 — an End event sits on the line it ends (V22.01)", () => {
  const r = laidOut();
  const by = (id: string) => r.elements.find((e) => e.id === id)!;

  it("T3301 the End event is not drawn on top of the gateway", () => {
    expect(hits(by("eEndIncomplete"), by("gwDup"))).toBe(false);
  });

  it("T3302 it sits on the row of the task whose flow it ends", () => {
    const ev = by("eEndIncomplete"), src = by("tIncomplete");
    expect(ev.y + ev.height / 2).toBeCloseTo(src.y + src.height / 2, 0);
  });

  it("T3303 the gateway keeps the mid-line of its own branches", () => {
    // The repair must not buy its fix by moving the gateway: sitting between its
    // branches is the rule Paul passed as J, and it decides which vertex each
    // branch leaves from.
    const gw = by("gwDup"), a = by("tAdvise"), b = by("tCreate");
    const span = (Math.min(a.y, b.y) + Math.max(a.y + a.height, b.y + b.height)) / 2;
    expect(gw.y + gw.height / 2).toBeCloseTo(span, 0);
  });

  it("T3304 no two bodies overlap anywhere in the diagram", () => {
    const solid = r.elements.filter((e) => e.type !== "pool" && e.type !== "lane");
    const bad: string[] = [];
    for (let i = 0; i < solid.length; i++) for (let k = i + 1; k < solid.length; k++) {
      const a = solid[i], b = solid[k];
      if (a.parentId === b.id || b.parentId === a.id) continue;
      if (a.boundaryHostId === b.id || b.boundaryHostId === a.id) continue;
      if (hits(a, b)) bad.push(`${a.id} over ${b.id}`);
    }
    expect(bad, bad.join("; ")).toEqual([]);
  });
});
