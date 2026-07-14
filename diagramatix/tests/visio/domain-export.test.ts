/**
 * Domain (UML class) diagram → Visio v3 export — structural assembly against
 * the STANDARD Visio UML stencil (base template `domain-template-uml.vsdx`).
 *
 * Checks what's verifiable without opening Visio: a valid .vsdx zip, classes
 * emitted as list-container groups referencing the Class master, members as
 * sibling shapes with the transcribed text, relationships glued with
 * <Connects>, and BpmnId + DgxUml/DgxUmlRel round-trip blobs. Rendering
 * fidelity is verified separately by opening the file in Visio.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { exportVisioDomainV3 } from "@/app/lib/diagram/v3/exportVisioDomainV3";
import { domainProfile } from "@/app/lib/diagram/v3/stencilProfile";
import type { DiagramData } from "@/app/lib/diagram/types";

const tmpl = () => fs.readFileSync(path.join(process.cwd(), "public", domainProfile.templateFile)).buffer;

const DATA: DiagramData = {
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: [
    {
      id: "c1", type: "uml-class", x: 80, y: 100, width: 220, height: 140, label: "Customer",
      properties: {
        showAttributes: true, showOperations: true,
        attributes: [
          { visibility: "+", name: "id", type: "Integer", primaryKey: true },
          { visibility: "-", name: "email", type: "String", multiplicity: "0..1" },
        ],
        operations: [{ visibility: "+", name: "rename" }],
      },
    },
    { id: "c2", type: "uml-class", x: 420, y: 100, width: 200, height: 100, label: "Order", properties: {} },
  ],
  connectors: [
    {
      id: "r1", sourceId: "c1", targetId: "c2", sourceSide: "right", targetSide: "left",
      type: "uml-association", directionType: "non-directed", routingType: "rectilinear",
      sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
      sourceMultiplicity: "1", targetMultiplicity: "*",
    },
  ],
};

describe("domain → Visio v3 export (standard UML, structural)", () => {
  it("produces a valid .vsdx with class groups, member shapes, and a glued association", async () => {
    const out = await exportVisioDomainV3(DATA, "Domain Test", tmpl());
    expect(out.byteLength).toBeGreaterThan(1000);
    const zip = await JSZip.loadAsync(out);

    const page = await zip.file("visio/pages/page1.xml")!.async("string");
    const masters = await zip.file("visio/masters/masters.xml")!.async("string");

    // Master map resolved from the template.
    const classId = (masters.match(/ID='(\d+)'[^>]*NameU='Class'/) || [])[1];
    const memberId = (masters.match(/ID='(\d+)'[^>]*NameU='Member'/) || [])[1];
    expect(classId).toBeTruthy();
    expect(memberId).toBeTruthy();

    // Classes reference the Class master; members reference the Member master.
    expect(page).toContain(`Master='${classId}'`);
    expect(page).toContain(`Master='${memberId}'`);

    // Attribute text transcribed onto member shapes.
    expect(page).toContain("+id: Integer {PK}");
    expect(page).toContain("+rename()");

    // Class name present.
    expect(page).toContain("<Text>Customer</Text>");

    // Round-trip blobs + glued association.
    expect(page).toContain("<Row N='DgxUml'>");
    expect(page).toContain("<Row N='DgxUmlRel'>");
    expect(page).toContain("<Connects>");
    expect((page.match(/<Connect /g) ?? []).length).toBe(2);

    // Connector is authored like a real Visio UML instance: explicit MoveTo IX=1
    // anchor + straight LineTo, a User section (angles + ShowMulti) and a
    // Connection section that drive the arrowheads and multiplicity sub-shapes.
    expect(page).toContain("<Row T='MoveTo' IX='1'>");
    expect(page).toContain("<Section N='User'><Row N='BeginAngle'>");
    expect(page).toContain("<Row N='ShowMulti'><Cell N='Value' V='1' U='BOOL'/></Row>");
    expect(page).toContain("<Section N='Connection'>");
    // Multiplicities emitted as child sub-shapes (MasterShape 6=begin, 8=end).
    expect(page).toMatch(/MasterShape='6'><Cell N='HideText' V='0'\/><Text>1<\/Text>/);
    expect(page).toMatch(/MasterShape='8'><Cell N='HideText' V='0'\/><Text>\*<\/Text>/);

    // Document infrastructure preserved from the standard-UML template.
    expect(zip.file("visio/theme/theme1.xml")).toBeTruthy();
    expect(zip.file("visio/pages/pages.xml")).toBeTruthy();
  });
});
