/**
 * T5282 — Paul, 2026-10-07: an edge event re-mounted on an Expanded Subprocess landed on top of the one already there ("it should have been
 * placed further left with an Event element width between them"). snapBoundaryEventToRim clamped each event to the rim on its own, so two
 * events apart before the host was resized could land almost on the same spot; spreadBoundaryEventsOnRim keeps one event width between
 * neighbours on a side.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";

const plans = (() => {
  const dir = path.join(process.cwd(), "tests", "fixtures", "layout-corpus");
  return readdirSync(dir).filter((f) => f.endsWith(".plan.json")).sort().map((f) => {
    const j = JSON.parse(readFileSync(path.join(dir, f), "utf8"));
    return { f, plan: j.diagrams?.[0]?.data?.aiGeneration?.plan ?? j.plan };
  });
})();

describe("T5282 edge events on one side of a host never overlap", () => {
  it("across the layout corpus, no two edge events on the same side of the same host overlap", () => {
    const bad: string[] = [];
    for (const { f, plan } of plans) {
      const g = layoutBpmnDiagram(plan.elements, plan.connections);
      const evs = g.elements.filter((e) => e.boundaryHostId);
      for (let i = 0; i < evs.length; i++) for (let j = i + 1; j < evs.length; j++) {
        const a = evs[i], b = evs[j];
        if (a.boundaryHostId !== b.boundaryHostId) continue;
        if (a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y) bad.push(`${f}: ${a.id} overlaps ${b.id}`);
      }
    }
    expect(bad).toEqual([]);
  });
  it("two timers mounted on a shrunken Expanded Subprocess end one event width apart (Paul's Application Process capture)", () => {
    const stored = { aiGeneration: JSON.parse(readFileSync("tests/fixtures/application-process-two-timers.plan.json", "utf8")) };
    const p = stored.aiGeneration.plan;
    const g = layoutBpmnDiagram(p.elements, p.connections);
    const a = g.elements.find((e) => e.id === "bTimerReply")!, b = g.elements.find((e) => e.id === "bTimerLapse")!;
    expect(a.boundaryHostId).toBe("spLoop");
    expect(Math.abs(a.x - b.x) - a.width).toBeGreaterThanOrEqual(a.width - 0.5);   // the gap between them is at least one event width
  });
});
