/**
 * T2869 — every typed-enum value the app can export must be DECLARED in the XSD.
 *
 * The XSD's enumerations are closed and `@type` is required, so a symbol type the
 * exporter emits but the schema does not list makes that export invalid — not
 * degraded, invalid. This is exactly what happened: the Standard Flowchart family
 * (21 shapes, 2 connectors, 1 diagram type) went undeclared from June, and the two
 * State Machine history states from August. Nothing failed, because the export
 * round-trip validation sampled neither diagram type — the gap was in the
 * coverage, not the checking, so adding one more sample diagram would only move
 * the blind spot somewhere else.
 *
 * This compares the union types themselves against the schema, so a new value
 * cannot ship undeclared regardless of which diagrams the other tests sample.
 *
 * The XSD may legitimately declare MORE than the app emits (retired values are
 * kept so older files still validate), so the check is one-directional.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const ts = fs.readFileSync(path.join(ROOT, "app/lib/diagram/types.ts"), "utf8");
const xsd = fs.readFileSync(path.join(ROOT, "public/diagramatix-export.xsd"), "utf8");

/** String-literal members of an exported TS union type. */
function unionValues(name: string): string[] {
  const i = ts.indexOf("export type " + name + " =");
  if (i < 0) throw new Error("TS union " + name + " not found");
  const body = ts.slice(i, ts.indexOf(";", i));
  return [...body.matchAll(/"([a-zA-Z0-9-]+)"/g)].map((m) => m[1]);
}

/** Every named xs:simpleType in the schema, mapped to its enumeration members. */
const XSD_ENUMS = new Map<string, string[]>(
  [...xsd.matchAll(/<xs:simpleType name="([^"]+)">([\s\S]*?)<\/xs:simpleType>/g)].map(
    (m) => [m[1], [...m[2].matchAll(/enumeration value="([^"]+)"/g)].map((e) => e[1])] as [string, string[]],
  ),
);

function xsdValues(name: string): string[] {
  const vals = XSD_ENUMS.get(name);
  if (!vals) throw new Error("XSD simpleType " + name + " not found");
  return vals;
}

describe("XSD ↔ TypeScript enum drift", () => {
  it.each([
    ["SymbolType", "SymbolTypeEnum"],
    ["ConnectorType", "ConnectorTypeEnum"],
    ["EventType", "EventTypeEnum"],
    ["GatewayType", "GatewayTypeEnum"],
    ["DiagramType", "DiagramTypeEnum"],
  ])("every %s value is declared in %s", (tsName, xsdName) => {
    const declared = new Set(xsdValues(xsdName));
    const undeclared = unionValues(tsName).filter((v) => !declared.has(v));
    expect(
      undeclared,
      `${tsName} values missing from the XSD — exports using them will not validate. Add an <xs:enumeration> (with a "schema N" marker) and bump SCHEMA_VERSION.`,
    ).toEqual([]);
  });

  it("the schema really is closed, so an undeclared value would be a hard failure", () => {
    // If @type ever became xs:string this guard would still pass while meaning
    // nothing — pin the assumption the whole test rests on.
    expect(xsd).toMatch(/<xs:attribute name="type"\s+type="dgx:SymbolTypeEnum" use="required"\/>/);
  });
});
