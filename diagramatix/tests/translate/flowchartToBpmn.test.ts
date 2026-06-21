/**
 * Deterministic Standard-Flowchart → BPMN transform.
 *
 * Pure tests (no DB): they exercise translateFlowchartToBpmn directly, plus one
 * integration check that the produced AI-plan graph lays out through the real
 * BPMN engine with non-empty connector waypoints (guards the editor-crash
 * regression where seed connectors lacked waypoints).
 */
import { describe, it, expect } from "vitest";
import {
  translateFlowchartToBpmn,
} from "@/app/lib/diagram/translate/flowchartToBpmn";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (
  id: string,
  type: string,
  extra?: Partial<DiagramElement>,
): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 120, height: 60, label: id, properties: {}, ...extra }) as DiagramElement;

const fl = (id: string, s: string, t: string, label?: string): Connector =>
  ({ id, sourceId: s, targetId: t, type: "flowline", label }) as unknown as Connector;

const diagram = (elements: DiagramElement[], connectors: Connector[]): DiagramData =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } });

const byId = (els: { id: string }[]) => new Map(els.map((e) => [e.id, e as any]));

describe("translateFlowchartToBpmn", () => {
  it("maps a linear terminator→process→terminator into start/task/end with a pool", () => {
    const d = diagram(
      [
        el("s", "flowchart-terminator", { label: "Start" }),
        el("p", "flowchart-process", { label: "Do work" }),
        el("e", "flowchart-terminator", { label: "End" }),
      ],
      [fl("c1", "s", "p"), fl("c2", "p", "e")],
    );
    const { aiElements, aiConnections } = translateFlowchartToBpmn(d, { processName: "Demo" });
    const m = byId(aiElements);
    expect(m.get("s").type).toBe("start-event");
    expect(m.get("p").type).toBe("task");
    expect(m.get("e").type).toBe("end-event");
    expect(aiElements.find((x) => x.type === "pool")?.label).toBe("Demo");
    expect(aiConnections).toEqual([
      { sourceId: "s", targetId: "p", type: "sequence" },
      { sourceId: "p", targetId: "e", type: "sequence" },
    ]);
  });

  it("maps a decision to an exclusive gateway and preserves Yes/No branch labels", () => {
    const d = diagram(
      [
        el("s", "flowchart-terminator"),
        el("d", "flowchart-decision", { label: "OK?" }),
        el("a", "flowchart-process"),
        el("b", "flowchart-process"),
        el("e", "flowchart-terminator"),
      ],
      [
        fl("c1", "s", "d"),
        fl("c2", "d", "a", "Yes"),
        fl("c3", "d", "b", "No"),
        fl("c4", "a", "e"),
        fl("c5", "b", "e"),
      ],
    );
    const { aiElements, aiConnections } = translateFlowchartToBpmn(d, { processName: "P" });
    const gw = byId(aiElements).get("d");
    expect(gw.type).toBe("gateway");
    expect(gw.gatewayType).toBe("exclusive");
    expect(aiConnections).toContainEqual({ sourceId: "d", targetId: "a", type: "sequence", label: "Yes" });
    expect(aiConnections).toContainEqual({ sourceId: "d", targetId: "b", type: "sequence", label: "No" });
  });

  it("splices a document out of the sequence and attaches it by association", () => {
    const d = diagram(
      [
        el("s", "flowchart-terminator"),
        el("a", "flowchart-process", { label: "Produce report" }),
        el("doc", "flowchart-document", { label: "Report" }),
        el("b", "flowchart-process"),
        el("e", "flowchart-terminator"),
      ],
      [fl("c1", "s", "a"), fl("c2", "a", "doc"), fl("c3", "doc", "b"), fl("c4", "b", "e")],
    );
    const { aiElements, aiConnections, report } = translateFlowchartToBpmn(d, { processName: "P" });
    expect(byId(aiElements).get("doc").type).toBe("data-object");
    // Sequence bypasses the document.
    expect(aiConnections).toContainEqual({ sourceId: "a", targetId: "b", type: "sequence" });
    // No sequence flow touches the artifact.
    expect(aiConnections.some((c) => (c.sourceId === "doc" || c.targetId === "doc") && c.type === "sequence")).toBe(false);
    // The producing activity is associated to the document (untyped → layout classifies).
    expect(aiConnections).toContainEqual({ sourceId: "a", targetId: "doc" });
    expect(report.dataObjectCount).toBe(1);
  });

  it("maps a database to a data-store", () => {
    const d = diagram(
      [el("a", "flowchart-process"), el("db", "flowchart-database", { label: "Customers" })],
      [fl("c1", "a", "db")],
    );
    const { aiElements, report } = translateFlowchartToBpmn(d, { processName: "P" });
    expect(byId(aiElements).get("db").type).toBe("data-store");
    expect(report.dataStoreCount).toBe(1);
  });

  it("splices on/off-page connector jump pairs so flow stays connected", () => {
    const d = diagram(
      [
        el("s", "flowchart-terminator"),
        el("a", "flowchart-process"),
        el("jin", "flowchart-offpage", { label: "P1" }),
        el("jout", "flowchart-offpage", { label: "P1" }),
        el("b", "flowchart-process"),
        el("e", "flowchart-terminator"),
      ],
      [fl("c1", "s", "a"), fl("c2", "a", "jin"), fl("c3", "jout", "b"), fl("c4", "b", "e")],
    );
    const { aiElements, aiConnections, report } = translateFlowchartToBpmn(d, { processName: "P" });
    // The stubs are not emitted.
    expect(aiElements.some((x) => x.id === "jin" || x.id === "jout")).toBe(false);
    // Flow is stitched A → B.
    expect(aiConnections).toContainEqual({ sourceId: "a", targetId: "b", type: "sequence" });
    expect(report.splices.length).toBeGreaterThan(0);
  });

  it("maps vertical swimlanes to a pool + lanes and assigns nodes by centre-x", () => {
    const d = diagram(
      [
        el("sw1", "flowchart-vswimlane", { label: "Sales", x: 0, width: 200 }),
        el("sw2", "flowchart-vswimlane", { label: "Finance", x: 200, width: 200 }),
        el("t1", "flowchart-process", { x: 60, width: 80 }),   // centre 100 → sw1
        el("t2", "flowchart-process", { x: 260, width: 80 }),  // centre 300 → sw2
      ],
      [fl("c1", "t1", "t2")],
    );
    const { aiElements, report } = translateFlowchartToBpmn(d, { processName: "P" });
    const lanes = aiElements.filter((x) => x.type === "lane");
    expect(lanes.map((l) => l.label)).toEqual(["Sales", "Finance"]);
    expect(report.laneCount).toBe(2);
    const m = byId(aiElements);
    expect(m.get("t1").lane).toBe("lane_sw1");
    expect(m.get("t2").lane).toBe("lane_sw2");
    // swimlane elements themselves are not emitted as flow nodes.
    expect(aiElements.some((x) => x.id === "sw1" && x.type !== "lane")).toBe(false);
  });

  it("is deterministic — identical input yields identical output", () => {
    const make = () =>
      diagram(
        [
          el("s", "flowchart-terminator"),
          el("d", "flowchart-decision"),
          el("a", "flowchart-process"),
          el("e", "flowchart-terminator"),
        ],
        [fl("c1", "s", "d"), fl("c2", "d", "a", "Yes"), fl("c3", "a", "e")],
      );
    const r1 = translateFlowchartToBpmn(make(), { processName: "P" });
    const r2 = translateFlowchartToBpmn(make(), { processName: "P" });
    expect(JSON.stringify(r1)).toEqual(JSON.stringify(r2));
  });

  it("lays out through the real BPMN engine with non-empty waypoints on every connector", () => {
    const d = diagram(
      [
        el("s", "flowchart-terminator", { label: "Start" }),
        el("d", "flowchart-decision", { label: "Approved?" }),
        el("a", "flowchart-process", { label: "Ship" }),
        el("b", "flowchart-process", { label: "Reject" }),
        el("doc", "flowchart-document", { label: "Invoice" }),
        el("e", "flowchart-terminator", { label: "End" }),
      ],
      [
        fl("c1", "s", "d"),
        fl("c2", "d", "a", "Yes"),
        fl("c3", "d", "b", "No"),
        fl("c4", "a", "doc"),
        fl("c5", "a", "e"),
        fl("c6", "b", "e"),
      ],
    );
    const { aiElements, aiConnections } = translateFlowchartToBpmn(d, { processName: "Orders" });
    const out = layoutBpmnDiagram(aiElements, aiConnections);
    expect(out.connectors.length).toBeGreaterThan(0);
    for (const c of out.connectors) {
      expect(Array.isArray(c.waypoints)).toBe(true);
      expect(c.waypoints.length).toBeGreaterThan(0);
    }
  });
});
