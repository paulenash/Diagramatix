/**
 * Full BPMN 2.0 — Tier 1 element import (T2217).
 *
 * Verifies the BPMN 2.0 XML importer maps the newly-supported elements:
 *   - complexGateway            → gateway (gatewayType "complex")
 *   - event with ≥2 definitions → intermediate-event (eventType "multiple")
 *   - callActivity              → collapsed subprocess (subprocessType "call")
 *   - task isForCompensation    → task (properties.isForCompensation)
 */
import { describe, it, expect } from "vitest";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="d1" targetNamespace="x">
  <bpmn:process id="p1">
    <bpmn:complexGateway id="cg1" name="Complex"/>
    <bpmn:intermediateCatchEvent id="me1" name="Multi">
      <bpmn:messageEventDefinition/>
      <bpmn:timerEventDefinition/>
    </bpmn:intermediateCatchEvent>
    <bpmn:callActivity id="ca1" name="Call" calledElement="sub"/>
    <bpmn:task id="t1" name="Comp" isForCompensation="true"/>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="di">
    <bpmndi:BPMNPlane id="pl" bpmnElement="p1">
      <bpmndi:BPMNShape id="s_cg1" bpmnElement="cg1"><dc:Bounds x="100" y="100" width="50" height="50"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_me1" bpmnElement="me1"><dc:Bounds x="200" y="100" width="36" height="36"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_ca1" bpmnElement="ca1"><dc:Bounds x="300" y="100" width="100" height="80"/></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="s_t1" bpmnElement="t1"><dc:Bounds x="450" y="100" width="100" height="80"/></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

describe("BPMN import — Tier 1 full-BPMN elements (T2217)", () => {
  it("maps complex gateway, multiple event, call activity + compensation task", async () => {
    const { data } = await importBpmnXml(XML, "tier1");
    const els = data.elements;

    expect(els.some((e) => e.type === "gateway" && e.gatewayType === "complex"), "complex gateway").toBe(true);
    expect(els.some((e) => e.type === "intermediate-event" && e.eventType === "multiple"), "multiple event").toBe(true);
    expect(els.some((e) => e.type === "subprocess" && (e.properties?.subprocessType as string) === "call"), "call activity").toBe(true);
    expect(els.some((e) => e.type === "task" && e.properties?.isForCompensation === true), "compensation task").toBe(true);
    // The call activity must NOT be imported as a plain task.
    expect(els.some((e) => e.type === "task" && (e.label ?? "").includes("Call"))).toBe(false);
  });
});
