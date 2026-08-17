/**
 * The BPMN Rules Checker flags connectors an ingested diagram carries that the
 * editor would have refused to draw (B42, via canConnect) and throwing EMIEs
 * (B43). Guards that a scan catches the connection rules we enforce.
 */
import { describe, it, expect } from "vitest";
import { checkConnectorLegality, checkEmieCatchOnly } from "@/app/lib/diagram/checks/diagramChecks";
import type { Connector, DiagramElement } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });
const conn = (id: string, s: string, t: string, type: string): Connector =>
  ({ id, type, sourceId: s, targetId: t, waypoints: [] } as unknown as Connector);

describe("B42 — connector-legality scan (reuses canConnect)", () => {
  it("flags a sequence flow INTO a non-boundary start event", () => {
    const data = { elements: [el("a", "task"), el("s", "start-event")], connectors: [conn("c1", "a", "s", "sequence")] };
    const v = checkConnectorLegality(data);
    expect(v.some((x) => x.ids.includes("c1"))).toBe(true);
  });

  it("flags a sequence flow that crosses a pool boundary", () => {
    const p1 = el("p1", "pool", { x: 0, y: 0, width: 400, height: 200 });
    const p2 = el("p2", "pool", { x: 0, y: 300, width: 400, height: 200 });
    const a = el("a", "task", { parentId: "p1" });
    const b = el("b", "task", { parentId: "p2" });
    const data = { elements: [p1, p2, a, b], connectors: [conn("c1", "a", "b", "sequence")] };
    expect(checkConnectorLegality(data).some((x) => x.ids.includes("c1"))).toBe(true);
  });

  it("flags a messageBPMN onto a NON-Message boundary intermediate event", () => {
    const host = el("h", "task");
    const errEmie = el("e", "intermediate-event", { boundaryHostId: "h", eventType: "error" });
    const data = { elements: [el("a", "task"), host, errEmie], connectors: [conn("c1", "a", "e", "messageBPMN")] };
    expect(checkConnectorLegality(data).some((x) => x.ids.includes("c1"))).toBe(true);
  });

  it("does NOT flag legal connectors (same-scope sequence, message to a Message EMIE)", () => {
    const host = el("h", "task");
    const msgEmie = el("e", "intermediate-event", { boundaryHostId: "h", eventType: "message" });
    const data = {
      elements: [el("a", "task"), el("b", "task"), host, msgEmie],
      connectors: [conn("c1", "a", "b", "sequence"), conn("c2", "a", "e", "messageBPMN")],
    };
    expect(checkConnectorLegality(data)).toHaveLength(0);
  });

  it("ignores dangling / self connectors (handled by other rules)", () => {
    const data = { elements: [el("a", "task")], connectors: [conn("c1", "a", "ghost", "sequence"), conn("c2", "a", "a", "sequence")] };
    expect(checkConnectorLegality(data)).toHaveLength(0);
  });
});

describe("B43 — an EMIE set to Throwing is flagged", () => {
  it("flags a throwing edge-mounted intermediate event, not a catching one", () => {
    const data = {
      elements: [
        el("host", "task"),
        el("bad", "intermediate-event", { boundaryHostId: "host", flowType: "throwing" }),
        el("ok", "intermediate-event", { boundaryHostId: "host", flowType: "catching" }),
        el("inline", "intermediate-event", { flowType: "throwing" }), // NOT edge-mounted → allowed
      ],
      connectors: [],
    };
    const v = checkEmieCatchOnly(data);
    expect(v.some((x) => x.ids.includes("bad"))).toBe(true);
    expect(v.some((x) => x.ids.includes("ok"))).toBe(false);
    expect(v.some((x) => x.ids.includes("inline"))).toBe(false);
  });
});
