/**
 * BPMN 2.0 XML export round-trip (item 4): importing a real .bpmn, exporting it
 * back to standard BPMN XML, and re-importing must preserve the meaningful node
 * and flow counts (pools/lanes may be normalised by the importer, so those are
 * not asserted exactly).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { importBpmnXml } from "@/app/lib/diagram/bpmn/importBpmnXml";
import { buildBpmnXml } from "@/app/lib/diagram/bpmn/exportBpmnXml";
import type { DiagramData } from "@/app/lib/diagram/types";

const DIR = path.join(process.cwd(), "public", "bpmn files");
const SAMPLE = path.join(DIR, "P01.06 Service Delivery Process.bpmn");
const SAMPLES = [
  "P01.06 Service Delivery Process.bpmn",
  "P01.01 Position Management Process.bpmn",
  "P01.07 Timekeeping Process.bpmn",
  "P01.3a.3 Solo Shifts - Weeks 3 & 4.bpmn",
];

// Count nodes/flows by a stable "kind" that survives normalisation.
function tally(d: DiagramData) {
  const nodeKinds: Record<string, number> = {};
  for (const e of d.elements) {
    if (["pool", "lane", "sublane"].includes(e.type)) continue;
    nodeKinds[e.type] = (nodeKinds[e.type] ?? 0) + 1;
  }
  const flows: Record<string, number> = {};
  for (const c of d.connectors) flows[c.type] = (flows[c.type] ?? 0) + 1;
  return { nodeKinds, flows };
}

describe("BPMN export round-trip", () => {
  it.each(SAMPLES)("re-imports self-exported BPMN with node + flow counts preserved: %s", async (file) => {
    const xml = fs.readFileSync(path.join(DIR, file), "utf8");
    const first = await importBpmnXml(xml, "sample");
    const t1 = tally(first.data);

    const exported = buildBpmnXml(first.data, "sample");
    expect(exported).toContain("<bpmn:definitions");
    expect(exported).toContain("<bpmndi:BPMNDiagram");

    const second = await importBpmnXml(exported, "sample");
    const t2 = tally(second.data);

    // Every node type present in the original survives with the same count.
    expect(t2.nodeKinds).toEqual(t1.nodeKinds);
    // Sequence + message + association flows survive.
    expect(t2.flows).toEqual(t1.flows);
  });

  it("emits DI bounds + waypoints so the file opens laid out", async () => {
    const xml = fs.readFileSync(SAMPLE, "utf8");
    const { data } = await importBpmnXml(xml, "sample");
    const out = buildBpmnXml(data, "sample");
    expect(out).toContain("<bpmndi:BPMNShape");
    expect(out).toContain("<dc:Bounds");
    expect(out).toContain("<di:waypoint");
  });
});
