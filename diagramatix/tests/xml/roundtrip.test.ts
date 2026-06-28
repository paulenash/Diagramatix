/**
 * Diagramatix XML export → import round-trip + schema sanity.
 *
 * The XML export wraps a DiagramData in the <diagramatix-export> envelope
 * (buildSingleDiagramXml); import is parseDiagramatixXml → diagrams[0].data.
 * We round-trip the canonical BPMN scenarios and assert the structure survives
 * (element count + per-type histogram, connector count, labels).
 *
 * XSD NOTE (reduced from the brief): there is NO XML-schema validator in the
 * dependency tree (no libxmljs / xmllint / xsd-schema-validator; fast-xml-parser
 * isn't even installed). The brief says: do NOT add a dependency — instead
 * assert WELL-FORMEDNESS (parses without error) + that the root element and
 * namespace match the XSD, and flag that strict XSD validation needs a
 * validator. That is exactly what the "schema sanity" block below does.
 * >>> FOLLOW-UP: to enforce the full XSD, add a validator (e.g. libxmljs2) and
 *     validate exported XML against public/diagramatix-export.xsd.
 *
 * DOMParser NOTE: parseDiagramatixXml is browser-only (uses DOMParser). The Node
 * test env has none and we can't add a dep, so _helpers/domParserShim wraps the
 * already-present htmlparser2 in just enough DOM surface to run the REAL parser
 * unmodified.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { parseDocument } from "htmlparser2";
import { SCENARIOS, build } from "../visio/_helpers/scenarios";
import { buildSingleDiagramXml, parseDiagramatixXml, NS } from "@/app/lib/diagram/xmlExport";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { installDomParser } from "./_helpers/domParserShim";

type El = { type: string; label?: string };
const typeHist = (els: El[]) => {
  const m: Record<string, number> = {};
  for (const e of els) m[e.type] = (m[e.type] ?? 0) + 1;
  return m;
};
const labels = (xs: { label?: string }[]) =>
  xs.map((x) => (x.label ?? "").trim()).filter(Boolean).sort();

const exportXml = (name: string, data: DiagramData) =>
  buildSingleDiagramXml({
    schemaVersion: SCHEMA_VERSION,
    appVersion: `${SCHEMA_VERSION}.0`,
    diagramName: name,
    diagramType: "bpmn",
    diagramData: data,
    diagramId: "d1",
  });

let restore: () => void;
beforeAll(() => { restore = installDomParser(); });
afterAll(() => { restore(); });

describe("Diagramatix XML — schema sanity (no XSD validator available)", () => {
  const xml = exportXml("linear flow", build(SCENARIOS[0]));

  it("is well-formed XML (parses without error)", () => {
    let threw = false;
    let doc;
    try { doc = parseDocument(xml, { xmlMode: true }); } catch { threw = true; }
    expect(threw).toBe(false);
    expect(doc!.children.length).toBeGreaterThan(0);
  });

  it("declares the XSD's root element + target namespace", () => {
    // Root element local name is diagramatix-export (matches the XSD root).
    expect(xml).toMatch(/<dgx:diagramatix-export[\s>]/);
    // Namespace URI matches targetNamespace in public/diagramatix-export.xsd.
    expect(NS).toBe("http://diagramatix.com/export/1.0");
    expect(xml).toContain(`xmlns:dgx="${NS}"`);
    // Envelope carries the schema version (XSD's version attribute family).
    expect(xml).toContain(`schemaVersion="${SCHEMA_VERSION}"`);
    // schemaLocation points at the schema endpoint.
    expect(xml).toContain("xsi:schemaLocation");
  });

  it("contains the diagram payload (elements + connectors blocks)", () => {
    expect(xml).toContain("<dgx:elements>");
    expect(xml).toContain("<dgx:connectors>");
    expect(xml).toContain("<dgx:element");
    expect(xml).toContain("<dgx:connector");
  });
});

describe("Diagramatix XML export → import round-trip", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — survives export → parse`, () => {
      const data = build(sc);
      const xml = exportXml(sc.name, data);
      const parsed = parseDiagramatixXml(xml);

      expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
      expect(parsed.diagrams.length).toBe(1);
      const back = parsed.diagrams[0].data as DiagramData;

      // Elements: same count + per-type histogram.
      expect(back.elements.length).toBe(data.elements.length);
      expect(typeHist(back.elements as El[])).toEqual(typeHist(data.elements as El[]));

      // Connectors: same count.
      expect(back.connectors.length).toBe(data.connectors.length);

      // Labels survive on both elements and connectors.
      expect(labels(back.elements)).toEqual(labels(data.elements));
      expect(labels(back.connectors)).toEqual(labels(data.connectors));

      // Diagram type + name survive on the envelope.
      expect(parsed.diagrams[0].type).toBe("bpmn");
      expect(parsed.diagrams[0].name).toBe(sc.name);
    });
  }

  it("element ids + connector source/target ids round-trip exactly", () => {
    const sc = SCENARIOS.find((s) => s.name === "gateways + events")!;
    const data = build(sc);
    const back = parseDiagramatixXml(exportXml(sc.name, data)).diagrams[0].data as DiagramData;

    expect(back.elements.map((e) => e.id).sort()).toEqual(data.elements.map((e) => e.id).sort());
    for (const c of back.connectors) {
      const orig = data.connectors.find((o) => o.id === c.id)!;
      expect(orig, `connector ${c.id} not in source`).toBeDefined();
      expect(c.sourceId).toBe(orig.sourceId);
      expect(c.targetId).toBe(orig.targetId);
    }
  });

  it("every imported connector references existing elements (no dangling refs)", () => {
    for (const sc of SCENARIOS) {
      const data = build(sc);
      const back = parseDiagramatixXml(exportXml(sc.name, data)).diagrams[0].data as DiagramData;
      const ids = new Set(back.elements.map((e) => e.id));
      for (const c of back.connectors) {
        expect(ids.has(c.sourceId), `${sc.name}: connector ${c.id} source ${c.sourceId} missing`).toBe(true);
        expect(ids.has(c.targetId), `${sc.name}: connector ${c.id} target ${c.targetId} missing`).toBe(true);
      }
    }
  });
});
