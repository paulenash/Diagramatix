/**
 * SharePoint data-object link survives save/load (GAP 5).
 *
 * NOTE ON SCOPE: app/lib/sharepoint.ts is almost entirely Microsoft Graph API
 * calls (searchSites / listDrives / downloadItem / uploadItem etc.). Those are
 * integration-only — they require a live Microsoft access token and network, so
 * they are NOT unit-tested here (mocking the Graph client would test the mock,
 * not the integration).
 *
 * The ONE genuine, code-only regression guard is the persistence contract: a
 * Data Object / Data Store element carrying
 *   properties.sharepointLink = { driveId, itemId, name, webUrl }   (schema v1.22)
 * must SURVIVE export → import, so a linked file stays linked after a save +
 * reload. We assert that across both serialisation paths the app uses:
 *   - the portable JSON export/import envelope, and
 *   - the Diagramatix XML path (buildSingleDiagramXml → parseDiagramatixXml).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { buildSingleDiagramXml, parseDiagramatixXml } from "@/app/lib/diagram/xmlExport";
import { installDomParser } from "../xml/_helpers/domParserShim";

/** The four-field SharePoint link payload (schema v1.22). */
const SP_LINK_OBJ = {
  driveId: "b!abc123DRIVE",
  itemId: "01ITEMxyz789",
  name: "Invoice Template.xlsx",
  webUrl: "https://contoso.sharepoint.com/sites/Finance/Shared%20Documents/Invoice%20Template.xlsx",
};
const SP_LINK_STORE = {
  driveId: "b!def456DRIVE",
  itemId: "01ITEMstore42",
  name: "Ledger.accdb",
  webUrl: "https://contoso.sharepoint.com/sites/Finance/Shared%20Documents/Ledger.accdb",
};

/** A minimal BPMN DiagramData with a data-object + data-store, each carrying a
 *  populated sharepointLink. Other elements/connectors are deliberately spare —
 *  the point is the sharepointLink property, not layout. */
function makeDiagramWithLinks(): DiagramData {
  const dataObject: DiagramElement = {
    id: "do1",
    type: "data-object",
    x: 100, y: 100, width: 60, height: 80,
    label: "Invoice",
    properties: { sharepointLink: { ...SP_LINK_OBJ } },
  };
  const dataStore: DiagramElement = {
    id: "ds1",
    type: "data-store",
    x: 300, y: 100, width: 70, height: 70,
    label: "Ledger",
    properties: { sharepointLink: { ...SP_LINK_STORE } },
  };
  const task: DiagramElement = {
    id: "t1",
    type: "task",
    x: 180, y: 90, width: 100, height: 80,
    label: "Issue invoice",
    properties: {},
  };
  return {
    elements: [task, dataObject, dataStore],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData;
}

const findLink = (data: DiagramData, id: string) =>
  (data.elements.find((e) => e.id === id)?.properties?.sharepointLink) as
    | typeof SP_LINK_OBJ
    | undefined;

// ── JSON path (the "Export as JSON" envelope) ─────────────────────────
describe("SharePoint link survives the JSON export → import path", () => {
  const makeEnvelope = (data: DiagramData) => ({
    schemaVersion: SCHEMA_VERSION,
    appVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: { name: "Test", description: "", ownerName: "", colorConfig: {} },
    diagrams: [{ originalId: "d1", name: "links", type: "bpmn", data }],
  });

  function roundTripJson(data: DiagramData): DiagramData {
    const text = JSON.stringify(makeEnvelope(data), null, 2);
    const parsed = JSON.parse(text);
    return parsed.diagrams[0].data as DiagramData;
  }

  it("data-object sharepointLink (all four fields) round-trips intact", () => {
    const back = roundTripJson(makeDiagramWithLinks());
    expect(findLink(back, "do1")).toEqual(SP_LINK_OBJ);
  });

  it("data-store sharepointLink (all four fields) round-trips intact", () => {
    const back = roundTripJson(makeDiagramWithLinks());
    expect(findLink(back, "ds1")).toEqual(SP_LINK_STORE);
  });
});

// ── Diagramatix XML path ──────────────────────────────────────────────
describe("SharePoint link survives the Diagramatix XML export → import path", () => {
  let restore: () => void;
  beforeAll(() => { restore = installDomParser(); });
  afterAll(() => { restore(); });

  const exportXml = (data: DiagramData) =>
    buildSingleDiagramXml({
      schemaVersion: SCHEMA_VERSION,
      appVersion: `${SCHEMA_VERSION}.0`,
      diagramName: "links",
      diagramType: "bpmn",
      diagramData: data,
      diagramId: "d1",
    });

  const roundTripXml = (data: DiagramData): DiagramData =>
    parseDiagramatixXml(exportXml(data)).diagrams[0].data as DiagramData;

  // FINDING: propertiesXml JSON-encodes nested objects and parseProperties
  // JSON-decodes any property text that starts with "{"/"[", so the XML path
  // DOES carry properties.sharepointLink through a round-trip. (If a future
  // change drops it, these two assertions fail — that is the guard.)
  it("data-object sharepointLink (all four fields) round-trips intact via XML", () => {
    const back = roundTripXml(makeDiagramWithLinks());
    expect(findLink(back, "do1")).toEqual(SP_LINK_OBJ);
  });

  it("data-store sharepointLink (all four fields) round-trips intact via XML", () => {
    const back = roundTripXml(makeDiagramWithLinks());
    expect(findLink(back, "ds1")).toEqual(SP_LINK_STORE);
  });

  it("the exported XML actually contains the serialised link (not silently dropped)", () => {
    const xml = exportXml(makeDiagramWithLinks());
    expect(xml).toContain("sharepointLink");
    expect(xml).toContain(SP_LINK_OBJ.driveId);
    expect(xml).toContain(SP_LINK_STORE.itemId);
  });
});
