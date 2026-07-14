/**
 * Domain (UML class) Visio round-trip — export → import equality.
 *
 * A domain DiagramData is emitted to a standard-UML .vsdx and read back by the
 * domain importer; the reconstructed semantics (element types/labels,
 * attributes/operations/values, package membership, connector types +
 * multiplicities) must equal the original — the lossless DgxUml/DgxUmlRel path.
 * Also covers the foreign path (a Diagramatix .vsdx with the blobs stripped).
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { exportVisioDomainV3 } from "@/app/lib/diagram/v3/exportVisioDomainV3";
import { importVisioDomainV3, isDomainVisio } from "@/app/lib/diagram/v3/importVisioDomainV3";
import { domainProfile } from "@/app/lib/diagram/v3/stencilProfile";
import type { DiagramData } from "@/app/lib/diagram/types";

const tmpl = () => fs.readFileSync(path.join(process.cwd(), "public", domainProfile.templateFile)).buffer;

const DATA: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    { id: "pkg", type: "uml-package", x: 20, y: 20, width: 700, height: 560, label: "Sales", properties: {} },
    { id: "c1", type: "uml-class", x: 60, y: 100, width: 240, height: 160, label: "Customer", parentId: "pkg",
      properties: { showAttributes: true, showOperations: true,
        attributes: [ { visibility: "+", name: "id", type: "Integer" }, { visibility: "-", name: "email", type: "String", multiplicity: "0..1" } ],
        operations: [ { visibility: "+", name: "rename" } ] } },
    { id: "c2", type: "uml-class", x: 420, y: 100, width: 220, height: 120, label: "Order", parentId: "pkg",
      properties: { showAttributes: true, attributes: [ { visibility: "+", name: "orderNo", type: "Integer" } ] } },
    { id: "e1", type: "uml-enumeration", x: 420, y: 320, width: 200, height: 120, label: "OrderStatus", parentId: "pkg",
      properties: { values: ["Pending", "Shipped", "Delivered"] } },
  ],
  connectors: [
    { id: "a1", sourceId: "c1", targetId: "c2", sourceSide: "right", targetSide: "left", type: "uml-association", directionType: "non-directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [], sourceMultiplicity: "1", targetMultiplicity: "*" },
    { id: "g1", sourceId: "c2", targetId: "e1", sourceSide: "bottom", targetSide: "top", type: "uml-dependency", directionType: "open-directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [] },
  ],
};

const byId = <T extends { id: string }>(arr: T[], id: string) => arr.find(e => e.id === id)!;

describe("domain Visio round-trip (lossless via DgxUml)", () => {
  it("detects the file as a domain diagram", async () => {
    const out = await exportVisioDomainV3(DATA, "RT", tmpl());
    expect(await isDomainVisio(out.buffer as ArrayBuffer)).toBe(true);
  });

  it("reconstructs elements, attributes/operations/values, membership, connectors", async () => {
    const out = await exportVisioDomainV3(DATA, "RT", tmpl());
    const { data } = await importVisioDomainV3(out.buffer as ArrayBuffer);

    expect(data.elements).toHaveLength(4);
    expect(data.connectors).toHaveLength(2);

    const c1 = byId(data.elements, "c1");
    expect(c1.type).toBe("uml-class");
    expect(c1.label).toBe("Customer");
    expect(c1.parentId).toBe("pkg");
    expect(c1.properties.attributes).toEqual(DATA.elements[1].properties.attributes);
    expect(c1.properties.operations).toEqual(DATA.elements[1].properties.operations);

    const e1 = byId(data.elements, "e1");
    expect(e1.type).toBe("uml-enumeration");
    expect(e1.properties.values).toEqual(["Pending", "Shipped", "Delivered"]);

    expect(byId(data.elements, "pkg").type).toBe("uml-package");

    const a1 = byId(data.connectors, "a1");
    expect(a1.type).toBe("uml-association");
    expect(a1.sourceId).toBe("c1"); expect(a1.targetId).toBe("c2");
    expect(a1.sourceMultiplicity).toBe("1"); expect(a1.targetMultiplicity).toBe("*");
    expect(byId(data.connectors, "g1").type).toBe("uml-dependency");
  });

  it("preserves connector direction, roles, arrowAtSource, readingDirection (Slice 2)", async () => {
    const rich: DiagramData = {
      viewport: { x: 0, y: 0, zoom: 1 },
      elements: [
        { id: "x", type: "uml-class", x: 40, y: 40, width: 200, height: 80, label: "X", properties: {} },
        { id: "y", type: "uml-class", x: 400, y: 40, width: 200, height: 80, label: "Y", properties: {} },
      ],
      connectors: [
        { id: "r1", sourceId: "x", targetId: "y", sourceSide: "right", targetSide: "left",
          type: "uml-association", directionType: "open-directed", routingType: "rectilinear",
          sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
          arrowAtSource: true, sourceRole: "owner", targetRole: "item",
          readingDirection: "to-target", sourceMultiplicity: "1", targetMultiplicity: "0..*" },
      ],
    };
    const out = await exportVisioDomainV3(rich, "RT2", tmpl());
    const { data } = await importVisioDomainV3(out.buffer as ArrayBuffer);
    const r1 = byId(data.connectors, "r1");
    expect(r1.directionType).toBe("open-directed");
    expect(r1.arrowAtSource).toBe(true);
    expect(r1.sourceRole).toBe("owner");
    expect(r1.targetRole).toBe("item");
    expect(r1.readingDirection).toBe("to-target");
    expect(r1.sourceMultiplicity).toBe("1");
    expect(r1.targetMultiplicity).toBe("0..*");
  });

  it("foreign path (blobs stripped) reconstructs from Member rows + master NameU", async () => {
    const out = await exportVisioDomainV3(DATA, "RT", tmpl());
    // Strip the DgxUml/DgxUmlRel + BpmnId blobs to simulate a non-Diagramatix file.
    const zip = await JSZip.loadAsync(out);
    let page = await zip.file("visio/pages/page1.xml")!.async("string");
    page = page.replace(/<Row N='(DgxUml|DgxUmlRel|BpmnId)'><Cell N='Value' V='[^']*'\/><\/Row>/g, "");
    zip.file("visio/pages/page1.xml", page);
    const stripped = await zip.generateAsync({ type: "uint8array" });

    const { data } = await importVisioDomainV3(stripped.buffer as ArrayBuffer);
    // Class with attributes + operations parsed from Member rows.
    const cust = data.elements.find(e => e.label === "Customer")!;
    expect(cust.type).toBe("uml-class");
    expect((cust.properties.attributes as any[]).map(a => a.name)).toEqual(["id", "email"]);
    expect((cust.properties.operations as any[]).map(o => o.name)).toEqual(["rename"]);
    // Enumeration values from its member rows.
    const enm = data.elements.find(e => e.label === "OrderStatus")!;
    expect(enm.type).toBe("uml-enumeration");
    expect(enm.properties.values).toEqual(["Pending", "Shipped", "Delivered"]);
  });
});
