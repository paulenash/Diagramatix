/**
 * Flowchart → BPMN translation of the new symbols:
 *  - a Parallel (fork/join) bar → a parallel gateway (a fork bar + a join bar
 *    become the matching pair);
 *  - a Comment → a text-annotation attached by association, NOT in the sequence.
 */
import { describe, it, expect } from "vitest";
import { translateFlowchartToBpmn } from "@/app/lib/diagram/translate/flowchartToBpmn";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import type { DiagramData, DiagramElement, Connector } from "@/app/lib/diagram/types";

const el = (id: string, type: string, extra?: Partial<DiagramElement>): DiagramElement =>
  ({ id, type, x: 0, y: 0, width: 120, height: 60, label: id, properties: {}, ...extra }) as DiagramElement;
const conn = (id: string, s: string, t: string, type = "flowline", label?: string): Connector =>
  ({ id, sourceId: s, targetId: t, type, label }) as unknown as Connector;
const diagram = (elements: DiagramElement[], connectors: Connector[]): DiagramData =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } });

describe("flowchart → BPMN: parallel + comment", () => {
  const d = diagram(
    [
      el("s", "flowchart-terminator", { label: "Start" }),
      el("fork", "flowchart-parallel", { width: 120, height: 8 }),
      el("a", "flowchart-process", { label: "Do A" }),
      el("b", "flowchart-process", { label: "Do B" }),
      el("join", "flowchart-parallel", { width: 120, height: 8 }),
      el("e", "flowchart-terminator", { label: "End" }),
      el("cmt", "flowchart-comment", { label: "Watch out" }),
    ],
    [
      conn("c1", "s", "fork"),
      conn("c2", "fork", "a"),
      conn("c3", "fork", "b"),
      conn("c4", "a", "join"),
      conn("c5", "b", "join"),
      conn("c6", "join", "e"),
      conn("c7", "a", "cmt", "flowchart-association"),
    ],
  );
  const { aiElements, aiConnections } = translateFlowchartToBpmn(d, { processName: "P" });
  const byId = new Map(aiElements.map((x) => [x.id, x]));

  it("maps both parallel bars to parallel gateways (the pair)", () => {
    expect(byId.get("fork")).toMatchObject({ type: "gateway", gatewayType: "parallel" });
    expect(byId.get("join")).toMatchObject({ type: "gateway", gatewayType: "parallel" });
  });

  it("keeps the concurrent branches as sequence flow through the gateways", () => {
    expect(aiConnections).toContainEqual({ sourceId: "fork", targetId: "a", type: "sequence" });
    expect(aiConnections).toContainEqual({ sourceId: "fork", targetId: "b", type: "sequence" });
    expect(aiConnections).toContainEqual({ sourceId: "a", targetId: "join", type: "sequence" });
    expect(aiConnections).toContainEqual({ sourceId: "b", targetId: "join", type: "sequence" });
  });

  it("maps the comment to a text-annotation attached by association, not sequence", () => {
    expect(byId.get("cmt")?.type).toBe("text-annotation");
    // Associated to the task it annotates (untyped → layout classifies as association).
    expect(aiConnections).toContainEqual({ sourceId: "a", targetId: "cmt" });
    // No sequence flow touches the comment.
    expect(aiConnections.some((c) => (c.sourceId === "cmt" || c.targetId === "cmt") && c.type === "sequence")).toBe(false);
  });

  it("lays out through the BPMN engine with waypoints on every connector", () => {
    const out = layoutBpmnDiagram(aiElements, aiConnections);
    expect(out.connectors.length).toBeGreaterThan(0);
    for (const c of out.connectors) expect(c.waypoints.length).toBeGreaterThan(0);
  });
});
