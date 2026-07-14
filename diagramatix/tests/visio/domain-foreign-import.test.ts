/**
 * Foreign (non-Diagramatix) Visio UML import — no DgxUml blobs, reconstructed
 * purely from master NameU + Member/Separator row text + <Connects> glue.
 * Fixtures are real Visio-drawn standard-UML class diagrams.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { importVisioDomainV3, isDomainVisio } from "@/app/lib/diagram/v3/importVisioDomainV3";
import type { UmlAttribute } from "@/app/lib/diagram/types";

const load = (name: string) =>
  fs.readFileSync(path.join(process.cwd(), "tests", "visio", "fixtures", name)).buffer as ArrayBuffer;

describe("foreign UML import — package fixture", () => {
  it("is detected as a domain diagram", async () => {
    expect(await isDomainVisio(load("foreign-uml-package.vsdx"))).toBe(true);
  });

  it("reconstructs package, classes (attrs+ops), enum values, note, connectors", async () => {
    const { data } = await importVisioDomainV3(load("foreign-uml-package.vsdx"));
    const byType = (t: string) => data.elements.filter(e => e.type === t);
    expect(byType("uml-package")).toHaveLength(1);
    expect(byType("uml-class").length).toBeGreaterThanOrEqual(3);
    expect(byType("uml-enumeration")).toHaveLength(1);
    expect(byType("uml-note")).toHaveLength(1);

    // At least one class has both attributes and operations reconstructed.
    const rich = byType("uml-class").find(c =>
      (c.properties.attributes as UmlAttribute[] | undefined)?.length &&
      (c.properties.operations as unknown[] | undefined)?.length);
    expect(rich).toBeTruthy();
    expect((rich!.properties.attributes as UmlAttribute[])[0].name).toBeTruthy();

    // Enum values reconstructed from its rows.
    const enm = byType("uml-enumeration")[0];
    expect((enm.properties.values as string[]).length).toBeGreaterThan(0);

    // Three relationship types survive (dependency, realisation, association).
    const types = new Set(data.connectors.map(c => c.type));
    expect(types.has("uml-dependency")).toBe(true);
    expect(types.has("uml-realisation")).toBe(true);
    expect(types.has("uml-association")).toBe(true);
  });
});

describe("foreign UML import — aggregation direction + multiplicities/roles + stereotype", () => {
  it("swaps the aggregation diamond to the correct end, reconstructs multiplicities/roles, and shows «Class»", async () => {
    const { data } = await importVisioDomainV3(load("domain-agg-multiplicity.vsdx"));
    const byLabel = Object.fromEntries(data.elements.map(e => [e.label, e]));

    // Visio draws the aggregation diamond at the BEGIN end (OrderLine); Diagramatix
    // renders the shared-diamond at the TARGET, so import swaps begin↔end — the
    // connector must end (diamond) on OrderLine, not Person.
    const agg = data.connectors.find(c => c.type === "uml-aggregation")!;
    expect(agg).toBeTruthy();
    expect(agg.sourceId).toBe(byLabel.Person.id);
    expect(agg.targetId).toBe(byLabel.OrderLine.id);
    // Multiplicities + role reconstructed from the connector's text sub-shapes.
    expect(agg.sourceMultiplicity).toBe("1..*");
    expect(agg.targetMultiplicity).toBe("1");
    expect(agg.sourceRole).toBe("person");

    const assoc = data.connectors.find(c => c.type === "uml-association")!;
    expect(assoc.sourceId).toBe(byLabel.OrderStatus.id);
    expect(assoc.targetId).toBe(byLabel.Order.id);
    expect(assoc.sourceMultiplicity).toBe("1");
    expect(assoc.targetMultiplicity).toBe("0..*");

    // Every imported class shows the «Class» stereotype header.
    for (const c of data.elements.filter(e => e.type === "uml-class")) {
      expect(c.properties.stereotype).toBe("Class");
      expect(c.properties.showStereotype).toBe(true);
    }
  });
});

describe("foreign UML import — plain classes fixture", () => {
  it("reconstructs 4 classes with members + agg/comp/assoc connectors", async () => {
    const { data } = await importVisioDomainV3(load("foreign-uml-classes.vsdx"));
    expect(data.elements.filter(e => e.type === "uml-class")).toHaveLength(4);
    // Every class got at least one attribute.
    for (const c of data.elements.filter(e => e.type === "uml-class")) {
      expect((c.properties.attributes as UmlAttribute[] | undefined)?.length ?? 0).toBeGreaterThan(0);
    }
    const types = new Set(data.connectors.map(c => c.type));
    expect(types.has("uml-association")).toBe(true);
    expect(types.has("uml-composition")).toBe(true);
    expect(types.has("uml-aggregation")).toBe(true);
  });
});
