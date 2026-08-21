import { describe, it, expect } from "vitest";
import { buildBpmnXml, bpmnRefId } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import { buildBpmnXmlWithSim } from "@/app/lib/simulation/bpsim/exportBpmnWithSim";
import { diagramToBpsimScenario, identityIdMap } from "@/app/lib/simulation/bpsim/diagramBpsim";
import { parseBpsimScenarios } from "@/app/lib/simulation/bpsim/importBpsim";
import { applyBpsimToDiagram } from "@/app/lib/simulation/bpsim/applyBpsimToDiagram";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2849 — a .bpmn export carries the simulation model.
 *
 * BPMN 2.0 has no native slot for sim parameters, so they ride in a BPSim block
 * inside definitions-level <extensionElements>. For that to resolve, the BPSim
 * elementRefs must use the SAME ids the BPMN exporter emits (bpmnRefId form).
 */
const diagram: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "s1", type: "start-event", x: 0, y: 0, width: 40, height: 40, label: "Start",
      properties: { sim: { arrival: { kind: "exponential", mean: 10 } } } },
    { id: "t1", type: "task", x: 100, y: 0, width: 90, height: 50, label: "Do it",
      properties: { sim: { cycleTime: { kind: "fixed", value: 25 }, teamId: "Sales", resourceUnits: 1 } } },
    { id: "e1", type: "end-event", x: 300, y: 0, width: 40, height: 40, label: "End", properties: {} },
  ],
  connectors: [
    { id: "c1", sourceId: "s1", targetId: "t1", type: "sequence" } as never,
    { id: "c2", sourceId: "t1", targetId: "e1", type: "sequence", branchProbability: 70 } as never,
  ],
} as unknown as DiagramData;

describe("BPMN export with embedded BPSim", () => {
  it("embeds a BPSimData block in definitions-level extensionElements, with the namespace", () => {
    const xml = buildBpmnXmlWithSim(diagram, "Order");
    expect(xml).toContain('xmlns:bpsim="http://www.bpsim.org/schemas/1.0"');
    expect(xml).toContain("<bpmn:extensionElements>");
    expect(xml).toContain("<bpsim:BPSimData");
    // The extension sits before the process body (definitions level), not inside it.
    expect(xml.indexOf("<bpmn:extensionElements>")).toBeLessThan(xml.indexOf("<bpmn:process"));
  });

  it("references elements by the SAME ids the BPMN document declares", () => {
    const xml = buildBpmnXmlWithSim(diagram, "Order");
    // The task is declared as id_t1 and the BPSim block must point at id_t1.
    expect(xml).toContain(`id="${bpmnRefId("t1")}"`);
    expect(xml).toContain(`elementRef="${bpmnRefId("t1")}"`);
    // Every BPSim ref must resolve to an id declared in the same document.
    const refs = [...xml.matchAll(/elementRef="([^"]+)"/g)].map((m) => m[1]);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(xml, `unresolved ref ${ref}`).toContain(`id="${ref}"`);
  });

  it("omits the extension entirely for a diagram with no sim data", () => {
    const bare: DiagramData = { ...diagram, elements: diagram.elements.map((e) => ({ ...e, properties: {} })), connectors: [] } as DiagramData;
    const xml = buildBpmnXmlWithSim(bare, "Bare");
    expect(xml).not.toContain("bpsim");
    expect(xml).not.toContain("<bpmn:extensionElements>");
    expect(xml).toContain("<bpmn:process"); // still a valid BPMN file
  });

  it("plain buildBpmnXml is unchanged when no sim block is passed", () => {
    expect(buildBpmnXml(diagram, "Order")).not.toContain("bpsim");
  });

  it("round-trips: the embedded model re-applies to the same diagram", () => {
    const xml = buildBpmnXmlWithSim(diagram, "Order");
    const scenarios = parseBpsimScenarios(xml, "minute");
    expect(scenarios.length).toBe(1);

    // Strip the sim data, then restore it from the exported file.
    const stripped: DiagramData = { ...diagram, elements: diagram.elements.map((e) => ({ ...e, properties: {} })) } as DiagramData;
    const restored = applyBpsimToDiagram(stripped, identityIdMap(stripped), scenarios[0]);

    const task = restored.elements.find((e) => e.id === "t1")!;
    expect(getSimParams(task).cycleTime).toEqual({ kind: "fixed", value: 25 });
    expect(getSimParams(task).teamId).toBe("Sales");
    const src = restored.elements.find((e) => e.id === "s1")!;
    expect(getSimParams(src).arrival).toEqual({ kind: "exponential", mean: 10 });
    expect(restored.connectors.find((c) => c.id === "c2")!.branchProbability).toBe(70);
  });

  it("identityIdMap still accepts raw refs, so older .bpsim.xml files import", () => {
    const legacy = diagramToBpsimScenario(diagram); // no refId → raw ids (pre-alignment format)
    expect(Object.keys(legacy.elements)).toContain("t1");
    const stripped: DiagramData = { ...diagram, elements: diagram.elements.map((e) => ({ ...e, properties: {} })) } as DiagramData;
    const restored = applyBpsimToDiagram(stripped, identityIdMap(stripped), legacy);
    expect(getSimParams(restored.elements.find((e) => e.id === "t1")!).cycleTime).toEqual({ kind: "fixed", value: 25 });
  });
});
