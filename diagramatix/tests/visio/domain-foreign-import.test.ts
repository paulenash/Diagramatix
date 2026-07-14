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
