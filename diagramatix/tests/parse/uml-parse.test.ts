/**
 * Shared UML attribute/operation parser (app/lib/diagram/umlParse.ts) used by
 * the Shift quick-add flow and the Visio domain importer.
 */
import { describe, it, expect } from "vitest";
import { parseUmlAttribute, parseUmlOperation } from "@/app/lib/diagram/umlParse";

describe("parseUmlAttribute", () => {
  it("parses Paul's full example (visibility, type, multiplicity, quoted default)", () => {
    const a = parseUmlAttribute('+ customerAddresses: String[0..*] = "25 Miller Street"');
    expect(a).toEqual({
      visibility: "+",
      name: "customerAddresses",
      type: "String",
      multiplicity: "0..*",
      defaultValue: '"25 Miller Street"',
    });
  });

  it("bare name, no visibility/type", () => {
    expect(parseUmlAttribute("total")).toEqual({ name: "total" });
  });

  it("visibility + name + type", () => {
    expect(parseUmlAttribute("- id : Integer")).toEqual({ visibility: "-", name: "id", type: "Integer" });
  });

  it("derived attribute (leading slash) after visibility", () => {
    expect(parseUmlAttribute("+ /fullName: String")).toEqual({
      visibility: "+", name: "fullName", type: "String", isDerived: true,
    });
  });

  it("multiplicity without a default", () => {
    expect(parseUmlAttribute("# tags: String [1..*]")).toEqual({
      visibility: "#", name: "tags", type: "String", multiplicity: "1..*",
    });
  });

  it("numeric default without quotes", () => {
    expect(parseUmlAttribute("- count: Integer = 0")).toEqual({
      visibility: "-", name: "count", type: "Integer", defaultValue: "0",
    });
  });
});

describe("parseUmlOperation", () => {
  it("parses a visibility + name + () operation", () => {
    expect(parseUmlOperation("+getCustName()")).toEqual({ visibility: "+", name: "getCustName" });
  });

  it("tolerates spaces and a parameter list (params not modelled yet)", () => {
    expect(parseUmlOperation("# doThing( a, b )")).toEqual({ visibility: "#", name: "doThing" });
  });

  it("bare name without visibility or parens", () => {
    expect(parseUmlOperation("reset")).toEqual({ name: "reset" });
  });
});
