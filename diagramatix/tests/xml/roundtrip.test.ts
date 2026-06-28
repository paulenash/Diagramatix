/**
 * Diagramatix XML export → import round-trip + schema sanity.
 *
 * The XML export wraps a DiagramData in the <diagramatix-export> envelope
 * (buildSingleDiagramXml); import is parseDiagramatixXml → diagrams[0].data.
 * We round-trip the canonical BPMN scenarios and assert the structure survives
 * (element count + per-type histogram, connector count, labels).
 *
 * XSD VALIDATION: the exported XML is validated against the REAL schema in
 * public/diagramatix-export.xsd using xmllint-wasm (a pure-WASM libxml2 build,
 * devDependency only — it never reaches the prod `npm ci --omit=dev` Docker
 * image). The XSD ships with `{{SCHEMA_VERSION}}` / `{{APP_VERSION}}`
 * placeholders that /api/schema substitutes at runtime; we do the same here
 * before validating.
 *
 * NB: validating surfaced a real XSD bug — PoolTypeEnum, SubprocessTypeEnum and
 * GatewayRoleEnum were each declared TWICE (a global simpleType cannot be
 * redefined), so the schema failed to compile under any conformant validator.
 * The duplicate definitions were removed from the XSD (the exporter was fine).
 *
 * DOMParser NOTE: parseDiagramatixXml is browser-only (uses DOMParser). The Node
 * test env has none, so _helpers/domParserShim wraps the already-present
 * htmlparser2 in just enough DOM surface to run the REAL parser unmodified.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseDocument } from "htmlparser2";
import { validateXML } from "xmllint-wasm";
import { SCENARIOS, build } from "../visio/_helpers/scenarios";
import { buildSingleDiagramXml, parseDiagramatixXml, NS } from "@/app/lib/diagram/xmlExport";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import type { DiagramData } from "@/app/lib/diagram/types";
import { installDomParser } from "./_helpers/domParserShim";

// The XSD as /api/schema would serve it: placeholders resolved to real versions.
const XSD = readFileSync(resolve(__dirname, "../../public/diagramatix-export.xsd"), "utf8")
  .replace(/\{\{SCHEMA_VERSION\}\}/g, SCHEMA_VERSION)
  .replace(/\{\{APP_VERSION\}\}/g, `${SCHEMA_VERSION}.0`);

/** Validate an exported XML string against the resolved XSD. */
const validateAgainstXsd = (xml: string) => validateXML({ xml, schema: XSD });

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

describe("Diagramatix XML — XSD validation (xmllint-wasm)", () => {
  const xml = exportXml("linear flow", build(SCENARIOS[0]));

  it("is well-formed XML (parses without error)", () => {
    let threw = false;
    let doc;
    try { doc = parseDocument(xml, { xmlMode: true }); } catch { threw = true; }
    expect(threw).toBe(false);
    expect(doc!.children.length).toBeGreaterThan(0);
  });

  it("the XSD itself compiles (no duplicate global type definitions)", async () => {
    // Guards the duplicate-simpleType regression: if a global type is declared
    // twice, libxml2 fails to compile the schema and reports it here as an
    // error rather than a validation failure.
    const res = await validateAgainstXsd(xml);
    const compileErrors = res.errors.filter((e) =>
      /already exist|failed to compile|Schemas parser error/i.test(e.rawMessage),
    );
    expect(compileErrors, compileErrors.map((e) => e.rawMessage).join("\n")).toEqual([]);
  });

  it("validates against public/diagramatix-export.xsd", async () => {
    const res = await validateAgainstXsd(xml);
    expect(res.errors.map((e) => e.message)).toEqual([]);
    expect(res.valid).toBe(true);
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

describe("Diagramatix XML — every exported scenario validates against the XSD", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.name} — exported XML is XSD-valid`, async () => {
      const xml = exportXml(sc.name, build(sc));
      const res = await validateAgainstXsd(xml);
      expect(res.errors.map((e) => e.message), `${sc.name} XSD errors`).toEqual([]);
      expect(res.valid).toBe(true);
    });
  }
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
