/**
 * BPMN default ("else") flow round-trip.
 *
 * BPMN holds the default flow as a `default="<flowId>"` attribute on the
 * GATEWAY; Diagramatix stores it as `isDefaultFlow` on the connector. Neither
 * side of the .bpmn interchange handled it, so a default flow was silently lost
 * on export and never recognised on import. The spec allows it only on gateways
 * that evaluate conditions — never on parallel or event-based.
 */
import { describe, it, expect } from "vitest";
import { buildBpmnXml } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import type { DiagramData, GatewayType } from "@/app/lib/diagram/types";

/** start → gateway → (A | B) → end, B flagged as the default flow. */
function diagramWithDefault(gatewayType: GatewayType): DiagramData {
  return {
    elements: [
      { id: "start", type: "start-event", label: "In", x: 0, y: 100, width: 40, height: 40, properties: {} },
      { id: "gw", type: "gateway", gatewayType, label: "Choose", x: 100, y: 95, width: 50, height: 50, properties: {} },
      { id: "a", type: "task", label: "A", x: 220, y: 20, width: 120, height: 70, properties: {} },
      { id: "b", type: "task", label: "B", x: 220, y: 160, width: 120, height: 70, properties: {} },
      { id: "end", type: "end-event", label: "Out", x: 420, y: 100, width: 40, height: 40, properties: {} },
    ],
    connectors: [
      { id: "c0", sourceId: "start", targetId: "gw", type: "sequence", waypoints: [] },
      { id: "cA", sourceId: "gw", targetId: "a", type: "sequence", waypoints: [], branchProbability: 70 },
      { id: "cB", sourceId: "gw", targetId: "b", type: "sequence", waypoints: [], isDefaultFlow: true },
      { id: "cA2", sourceId: "a", targetId: "end", type: "sequence", waypoints: [] },
      { id: "cB2", sourceId: "b", targetId: "end", type: "sequence", waypoints: [] },
    ],
  } as unknown as DiagramData;
}

/** Re-import an exported diagram and return the connector that came from `srcId`
 *  → `tgtId`, matched through the importer's bpmn-id map. */
async function roundTrip(data: DiagramData, name = "default-flow") {
  const xml = buildBpmnXml(data, name);
  const back = await importBpmnXml(xml, name);
  return { xml, back };
}

describe("BPMN default flow — export", () => {
  it("emits `default` on an exclusive gateway, pointing at the flagged flow", () => {
    const xml = buildBpmnXml(diagramWithDefault("exclusive"), "d");
    expect(xml).toContain("<bpmn:exclusiveGateway");
    // The attribute names the FLOW, and it is the one we flagged (cB), not cA.
    expect(xml).toMatch(/<bpmn:exclusiveGateway[^>]*default="id_cB"/);
  });

  it("emits `default` on an inclusive gateway too", () => {
    const xml = buildBpmnXml(diagramWithDefault("inclusive"), "d");
    expect(xml).toMatch(/<bpmn:inclusiveGateway[^>]*default="id_cB"/);
  });

  it("never emits `default` on a parallel gateway", () => {
    // A parallel gateway evaluates no conditions; the spec forbids a default.
    const xml = buildBpmnXml(diagramWithDefault("parallel"), "d");
    expect(xml).toContain("<bpmn:parallelGateway");
    expect(xml).not.toMatch(/<bpmn:parallelGateway[^>]*default=/);
  });

  it("never emits `default` on an event-based gateway", () => {
    const xml = buildBpmnXml(diagramWithDefault("event-based"), "d");
    expect(xml).not.toMatch(/default="id_cB"/);
  });

  it("omits the attribute entirely when no flow is flagged", () => {
    const data = diagramWithDefault("exclusive");
    delete (data.connectors.find((c) => c.id === "cB") as { isDefaultFlow?: boolean }).isDefaultFlow;
    expect(buildBpmnXml(data, "d")).not.toMatch(/default=/);
  });
});

describe("BPMN default flow — import", () => {
  it("round-trips: the same flow comes back flagged", async () => {
    const { back } = await roundTrip(diagramWithDefault("exclusive"));

    const flagged = back.data.connectors.filter((c) => c.isDefaultFlow);
    expect(flagged).toHaveLength(1);

    // It is the gateway→B edge, resolved through the importer's id map.
    const gwId = back.idMap["id_gw"];
    const bId = back.idMap["id_b"];
    expect(flagged[0].sourceId).toBe(gwId);
    expect(flagged[0].targetId).toBe(bId);
  });

  it("still only one default after a round-trip of an inclusive gateway", async () => {
    const { back } = await roundTrip(diagramWithDefault("inclusive"));
    expect(back.data.connectors.filter((c) => c.isDefaultFlow)).toHaveLength(1);
  });

  it("ignores a `default` a file puts on a parallel gateway", async () => {
    // Hand-rolled: some tools emit attributes the spec disallows. We should not
    // adopt one onto a gateway that takes every branch regardless.
    const xml = buildBpmnXml(diagramWithDefault("parallel"), "d")
      .replace("<bpmn:parallelGateway", '<bpmn:parallelGateway default="id_cB"');
    const back = await importBpmnXml(xml, "d");
    expect(back.data.connectors.some((c) => c.isDefaultFlow)).toBe(false);
  });

  it("leaves everything unflagged when the file has no default", async () => {
    const data = diagramWithDefault("exclusive");
    delete (data.connectors.find((c) => c.id === "cB") as { isDefaultFlow?: boolean }).isDefaultFlow;
    const { back } = await roundTrip(data);
    expect(back.data.connectors.some((c) => c.isDefaultFlow)).toBe(false);
  });
});
