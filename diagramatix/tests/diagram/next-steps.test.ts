/**
 * Tier-1 next-step suggestions (app/lib/diagram/nextSteps.ts, T2225): the right
 * ranked menu per source type, and every candidate is canConnect-legal.
 */
import { describe, it, expect } from "vitest";
import { suggestNextSteps } from "@/app/lib/diagram/nextSteps";
import { canConnect } from "@/app/lib/diagram/canConnect";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });
const data = (elements: DiagramElement[]): DiagramData =>
  ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } });

describe("suggestNextSteps", () => {
  it("start-event → a Task", () => {
    const s = el("s", "start-event");
    const out = suggestNextSteps(s, data([s]), "bpmn");
    expect(out.map((c) => c.symbolType)).toEqual(["task"]);
  });

  it("task → Task, Decision, End (in that order)", () => {
    const s = el("t", "task");
    const out = suggestNextSteps(s, data([s]), "bpmn");
    expect(out.map((c) => c.label)).toEqual(["Task", "Decision", "End"]);
  });

  it("end-event → nothing follows", () => {
    const s = el("e", "end-event");
    expect(suggestNextSteps(s, data([s]), "bpmn")).toHaveLength(0);
  });

  it("only offers legal candidates (every one passes canConnect)", () => {
    const s = el("t", "task");
    const d = data([s]);
    for (const c of suggestNextSteps(s, d, "bpmn")) {
      const synthetic = el("__ghost__", c.symbolType, c.gatewayType ? { gatewayType: c.gatewayType } : {});
      expect(canConnect(s, synthetic, c.connectorType, d.elements)).toBe(true);
    }
  });

  it("non-BPMN diagram types get no Tier-1 suggestions (yet)", () => {
    const s = el("t", "task");
    expect(suggestNextSteps(s, data([s]), "archimate")).toHaveLength(0);
  });
});
