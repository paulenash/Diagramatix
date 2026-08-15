/**
 * IO-02 / IO-08 / IO-10 — the DDL importer must treat SQL identifiers
 * case-insensitively and must not be corruptible by hostile table names.
 *
 *  IO-02  A FK that references a table using different casing than its CREATE
 *         must still draw the relationship connector.
 *  IO-10  An enumeration table keyed on a `Code`/`CODE` column (any case) must
 *         still be detected as an enum.
 *  IO-08  A table named `__proto__` must not pollute the internal lookup or
 *         fabricate a bogus connector.
 */
import { describe, it, expect } from "vitest";
import { parseDDL, generateDiagramFromDDL } from "@/app/lib/diagram/ddlImport";
import type { DiagramData } from "@/app/lib/diagram/types";

const importDDL = (sql: string): DiagramData =>
  generateDiagramFromDDL(parseDDL(sql), "postgres");

describe("DDL importer — case-insensitive identifiers (IO-02/IO-10)", () => {
  it("draws a FK connector when the reference casing differs from the CREATE", () => {
    const sql = `
      CREATE TABLE Customer (
        id INT PRIMARY KEY
      );
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        customer_id INT REFERENCES CUSTOMER(id)
      );
    `;
    const d = importDDL(sql);
    const classes = d.elements.filter((e) => e.type === "uml-class");
    expect(classes).toHaveLength(2);
    // The FK edge survives despite Customer / CUSTOMER / customer mismatches.
    expect(d.connectors.length).toBe(1);
  });

  it("detects an enum table whose key column is upper-case CODE", () => {
    const sql = `
      CREATE TABLE Status (
        CODE VARCHAR(20) PRIMARY KEY
      );
      INSERT INTO status (CODE) VALUES ('OPEN'), ('CLOSED');
    `;
    const d = importDDL(sql);
    const en = d.elements.find((e) => e.type === "uml-enumeration");
    expect(en).toBeTruthy();
    expect((en!.properties.values as string[])).toEqual(["OPEN", "CLOSED"]);
  });
});

describe("DDL importer — prototype-pollution safety (IO-08)", () => {
  it("does not crash or fabricate an edge for a __proto__ table", () => {
    const sql = `
      CREATE TABLE __proto__ (
        id INT PRIMARY KEY
      );
      CREATE TABLE orders (
        id INT PRIMARY KEY,
        ref INT REFERENCES __proto__(id)
      );
    `;
    // Must not throw, and must not invent an edge to a prototype-chain ghost.
    const d = importDDL(sql);
    const classes = d.elements.filter((e) => e.type === "uml-class");
    expect(classes).toHaveLength(2);
    // A legitimately-declared FK between the two real tables is fine (1 edge);
    // what must NOT happen is a bogus self/ghost edge from prototype lookup.
    expect(d.connectors.length).toBeLessThanOrEqual(1);
  });
});
