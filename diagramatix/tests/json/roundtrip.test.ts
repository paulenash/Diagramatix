/**
 * Portable JSON export → import round-trip.
 *
 * The diagram "Export as JSON" path is a plain JSON.stringify of an export
 * envelope ({ schemaVersion, project, diagrams: [{ data: DiagramData, … }] }),
 * and import is JSON.parse → take diagrams[0].data. There is no transform on
 * either side, so the contract we must guarantee is: serialise → parse
 * reconstructs an EQUIVALENT DiagramData — no element/connector dropped, no
 * label mangled, numbers/booleans preserved.
 *
 * We round-trip the canonical BPMN scenarios (reused from the Visio harness)
 * plus a flowchart, asserting the element count + per-type histogram, the
 * connector count, every label, and a structural deep-equal of the data.
 */
import { describe, it, expect } from "vitest";
import { SCENARIOS, build } from "../visio/_helpers/scenarios";
import { layoutFlowchartDiagram } from "@/app/lib/diagram/layoutFlowchart";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import type { DiagramData } from "@/app/lib/diagram/types";

type El = { type: string; label?: string };
const typeHist = (els: El[]) => {
  const m: Record<string, number> = {};
  for (const e of els) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const labels = (xs: { label?: string }[]) =>
  xs.map((x) => (x.label ?? "").trim()).filter(Boolean).sort();

/** Mirrors the editor's "Export as JSON" envelope (the meaningful subset). */
const makeEnvelope = (name: string, type: string, data: DiagramData) => ({
  schemaVersion: SCHEMA_VERSION,
  appVersion: SCHEMA_VERSION,
  exportedAt: new Date().toISOString(),
  project: { name: "Test", description: "", ownerName: "", colorConfig: {} },
  diagrams: [{ originalId: "d1", name, type, data }],
});

/** Serialise → parse → pull the single diagram's data back out, exactly as the
 *  import flow does. */
function roundTripJson(name: string, type: string, data: DiagramData): DiagramData {
  const text = JSON.stringify(makeEnvelope(name, type, data), null, 2);
  const parsed = JSON.parse(text);
  return parsed.diagrams[0].data as DiagramData;
}

// A representative flowchart so a non-BPMN type also exercises the path.
const FLOWCHART: DiagramData = layoutFlowchartDiagram({
  elements: [
    { id: "s", type: "terminator", label: "Start" },
    { id: "d", type: "decision", label: "Approved?" },
    { id: "pa", type: "process", label: "Ship order" },
    { id: "pb", type: "process", label: "Reject order" },
    { id: "m", type: "merge", label: "" },
    { id: "e", type: "terminator", label: "End" },
  ],
  connections: [
    { sourceId: "s", targetId: "d" },
    { sourceId: "d", targetId: "pa", label: "Yes" },
    { sourceId: "d", targetId: "pb", label: "No" },
    { sourceId: "pa", targetId: "m" },
    { sourceId: "pb", targetId: "m" },
    { sourceId: "m", targetId: "e" },
  ],
});

const CASES: { name: string; type: string; data: DiagramData }[] = [
  ...SCENARIOS.map((sc) => ({ name: sc.name, type: "bpmn", data: build(sc) })),
  { name: "flowchart", type: "flowchart", data: FLOWCHART },
];

describe("portable JSON export → import round-trip", () => {
  for (const c of CASES) {
    it(`${c.name} — survives JSON serialise → parse`, () => {
      const back = roundTripJson(c.name, c.type, c.data);

      // Elements: same count + per-type histogram.
      expect(back.elements.length).toBe(c.data.elements.length);
      expect(typeHist(back.elements as El[])).toEqual(typeHist(c.data.elements as El[]));

      // Connectors: same count.
      expect(back.connectors.length).toBe(c.data.connectors.length);

      // Labels survive on both elements and connectors.
      expect(labels(back.elements)).toEqual(labels(c.data.elements));
      expect(labels(back.connectors)).toEqual(labels(c.data.connectors));

      // No transform → a JSON-clean deep-equal must hold for the whole data.
      // (JSON.parse(JSON.stringify(x)) is the canonical "JSON-clean" form; it
      // strips undefined fields, which the source data does not contain, so
      // round-tripping the original through the same lens makes them comparable.)
      expect(back).toEqual(JSON.parse(JSON.stringify(c.data)));
    });
  }

  it("element ids and connector source/target ids are preserved exactly", () => {
    const sc = SCENARIOS.find((s) => s.name === "gateways + events")!;
    const data = build(sc);
    const back = roundTripJson(sc.name, "bpmn", data);
    expect(back.elements.map((e) => e.id).sort()).toEqual(data.elements.map((e) => e.id).sort());
    for (const c of back.connectors) {
      const orig = data.connectors.find((o) => o.id === c.id)!;
      expect(orig).toBeDefined();
      expect(c.sourceId).toBe(orig.sourceId);
      expect(c.targetId).toBe(orig.targetId);
    }
  });

  it("numeric geometry + waypoints survive without precision loss", () => {
    const data = build(SCENARIOS[0]);
    const back = roundTripJson("linear", "bpmn", data);
    for (const e of data.elements) {
      const b = back.elements.find((x) => x.id === e.id)!;
      expect([b.x, b.y, b.width, b.height]).toEqual([e.x, e.y, e.width, e.height]);
    }
    for (const c of data.connectors) {
      const b = back.connectors.find((x) => x.id === c.id)!;
      expect(b.waypoints).toEqual(c.waypoints);
    }
  });
});
