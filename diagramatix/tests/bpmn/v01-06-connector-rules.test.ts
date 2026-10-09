/**
 * T5295 — V01.06 Deliver to Customer (Paul, 2026-10-10): a gateway's outgoing flow does not leave by a vertex an incoming flow uses,
 * a timeout flow does not run through another task, and the two checks (B30, B54) report as WARNINGS; the advisory
 * "recommended trigger" warning on a task with a message flow is gone.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { checkDiagram, checkTaskTypeForMessages, rulesMetadata } from "@/app/lib/diagram/checks/diagramChecks";

const plan = JSON.parse(readFileSync("tests/fixtures/containment-2026-10-09/paul-V01.06.plan.json", "utf8"));

describe("T5295 V01.06 connector rules", () => {
  const data = layoutBpmnDiagram(plan.elements, plan.connections);
  const found = checkDiagram(data as never);

  it("no flow leaves a gateway by a vertex an incoming flow arrives on", () => {
    expect(found.filter((v) => v.rule === "gateway-in-out-vertex").map((v) => v.message)).toEqual([]);
  });

  it("no sequence flow runs through an element it is not connected to (the timeout flow slides clear of the appointment task)", () => {
    expect(found.filter((v) => v.rule === "sequence-clips-foreign-node").map((v) => v.message)).toEqual([]);
  });

  it("the two rules are warnings, in the rule table and on the violations they raise", () => {
    const meta = rulesMetadata();
    expect(meta.find((r) => r.id === "sequence-clips-foreign-node")!.severity).toBe("warning");
    expect(meta.find((r) => r.id === "gateway-in-out-vertex")!.severity).toBe("warning");
    // A real clip and a real vertex clash, built by hand, come out as warnings too.
    const el = (id: string, type: string, x: number, y: number, w: number, h: number) => ({ id, type, x, y, width: w, height: h, label: id, properties: {} });
    const clip = checkDiagram({
      elements: [el("a", "task", 0, 0, 100, 60), el("b", "task", 300, 0, 100, 60), el("m", "task", 150, 0, 100, 60)],
      connectors: [{ id: "c", type: "sequence", sourceId: "a", targetId: "b", sourceSide: "right", targetSide: "left", waypoints: [{ x: 100, y: 30 }, { x: 300, y: 30 }] }],
    } as never).filter((v) => v.rule === "sequence-clips-foreign-node");
    expect(clip).toHaveLength(1);
    expect(clip[0].severity).toBe("warning");
  });

  it("a Service task retrieving from an IT system is not told its trigger should be 'user'", () => {
    const el = (id: string, type: string, extra: object = {}) => ({ id, type, x: 0, y: 0, width: 100, height: 60, label: id, properties: {}, ...extra });
    const d = {
      elements: [
        el("sys", "pool", { properties: { poolType: "black-box", isSystem: true } }),
        el("t", "task", { taskType: "service" }),
      ],
      connectors: [{ id: "m", type: "messageBPMN", sourceId: "sys", targetId: "t", waypoints: [] }],
    };
    expect(checkTaskTypeForMessages(d as never)).toEqual([]);
    // …but a FORBIDDEN trigger is still an error.
    const bad = checkTaskTypeForMessages({ ...d, elements: [d.elements[0], el("t", "task", { taskType: "send" })] } as never);
    expect(bad).toHaveLength(1);
    expect(bad[0].severity).toBe("error");
  });
});
