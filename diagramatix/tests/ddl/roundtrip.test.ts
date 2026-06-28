/**
 * DDL round-trip — generate → parse → import back to a Domain diagram.
 *
 * TWO REDUCTIONS FROM THE BRIEF (called out so they're not mistaken for full
 * coverage):
 *
 *  1. There is NO data-driven "DiagramData → DDL" path. generateDiagramatixDDL
 *     emits a FIXED, hardcoded relational schema (the Diagramatix app's own DB),
 *     not a schema derived from a diagram. So the honest round-trip is:
 *         generateDiagramatixDDL(dialect)  →  SQL text
 *           → parseDDL(sql)                →  ParsedTable[]
 *           → generateDiagramFromDDL(...)  →  DiagramData (a Domain diagram)
 *
 *  2. The DDL IMPORTER faithfully round-trips POSTGRES and MYSQL (24 entity
 *     tables, ~70 FK connectors each). It does NOT faithfully import the
 *     generator's SQL SERVER output — bracket-quoted identifiers + the
 *     generator's REFERENCES placement defeat the regex parser, yielding spurious
 *     "tables" and ZERO FK connectors. Per the brief ("if import only supports
 *     one dialect, round-trip those and assert the others just generate"), we
 *     fully round-trip pg + mysql and assert mssql only GENERATES without error.
 *     >>> FOLLOW-UP: make parseDDL handle the mssql generator output (bracketed
 *         ids across multi-line REFERENCES) to lift mssql to a full round-trip.
 */
import { describe, it, expect } from "vitest";
import { generateDiagramatixDDL } from "@/app/lib/diagram/ddlGenerate";
import { parseDDL, generateDiagramFromDDL } from "@/app/lib/diagram/ddlImport";
import type { DiagramData, UmlAttribute } from "@/app/lib/diagram/types";

// Dialects that round-trip cleanly through the importer today.
const ROUNDTRIP_DIALECTS = ["postgres", "mysql"] as const;
const ALL_DIALECTS = ["postgres", "mysql", "mssql"] as const;

const importDDL = (sql: string, dialect: string): DiagramData =>
  generateDiagramFromDDL(parseDDL(sql), dialect);

const tableNames = (d: DiagramData) =>
  d.elements.filter((e) => e.type === "uml-class").map((e) => e.label).sort();
const attrs = (d: DiagramData, label: string): UmlAttribute[] =>
  ((d.elements.find((e) => e.type === "uml-class" && e.label === label)
    ?.properties.attributes as UmlAttribute[] | undefined) ?? []);

describe("DDL generation — all dialects produce SQL without error", () => {
  for (const dialect of ALL_DIALECTS) {
    it(`${dialect} — generates non-empty DDL`, () => {
      const sql = generateDiagramatixDDL(dialect);
      expect(typeof sql).toBe("string");
      expect(sql).toContain("CREATE TABLE");
      expect(sql).toMatch(/\borg\b/);
      expect(sql).toMatch(/\bproject\b/);
      expect(sql).toMatch(/\belement\b/);
      // parseDDL must not throw on any dialect's output (it may under-parse
      // mssql, but it must not crash).
      expect(() => parseDDL(sql)).not.toThrow();
    });
  }

  it("all three dialects produce DISTINCT, dialect-specific DDL", () => {
    const pg = generateDiagramatixDDL("postgres");
    const my = generateDiagramatixDDL("mysql");
    const ms = generateDiagramatixDDL("mssql");
    expect(pg).not.toBe(my);
    expect(my).not.toBe(ms);
    expect(pg).not.toBe(ms);
    expect(pg).toMatch(/BIGSERIAL/);
    expect(my).toMatch(/AUTO_INCREMENT/);
    expect(ms).toMatch(/IDENTITY/);
    expect(ms).toMatch(/\bGO\b/);
  });
});

describe("DDL round-trip — Diagramatix schema (postgres + mysql)", () => {
  for (const dialect of ROUNDTRIP_DIALECTS) {
    it(`${dialect} — round-trips into a Domain diagram (tables + FKs survive)`, () => {
      const sql = generateDiagramatixDDL(dialect);
      const data = importDDL(sql, dialect);

      // Entity tables become uml-class elements; the schema has many tables.
      const tables = tableNames(data);
      expect(tables.length).toBeGreaterThan(15);
      for (const t of ["org", "app_user", "project", "diagram", "element", "connector"]) {
        expect(tables, `expected table ${t} after ${dialect} round-trip`).toContain(t);
      }

      // Columns survive: project has id (PK) + a user_id FK → app_user.
      const projCols = attrs(data, "project");
      expect(projCols.map((c) => c.name)).toContain("id");
      expect(projCols.find((c) => c.name === "id")?.primaryKey).toBe(true);
      const userFk = projCols.find((c) => c.name === "user_id");
      expect(userFk?.foreignKey).toBe(true);
      expect(userFk?.fkTable).toBe("app_user");

      // FK relationships become uml-association connectors referencing real
      // elements on both ends.
      const fkConns = data.connectors.filter((c) => c.type === "uml-association");
      expect(fkConns.length).toBeGreaterThan(10);
      const ids = new Set(data.elements.map((e) => e.id));
      for (const c of fkConns) {
        expect(ids.has(c.sourceId)).toBe(true);
        expect(ids.has(c.targetId)).toBe(true);
        expect(c.sourceId).not.toBe(c.targetId); // self-FKs dropped by design
      }

      // The org_member → app_user FK must materialise as a connector between
      // exactly those two tables.
      const orgMember = data.elements.find((e) => e.label === "org_member")!;
      const appUser = data.elements.find((e) => e.label === "app_user")!;
      const link = fkConns.find((c) => c.sourceId === orgMember.id && c.targetId === appUser.id);
      expect(link, "org_member → app_user FK connector missing").toBeDefined();
    });
  }

  it("mssql import is known-lossy (documented reduction, not a silent pass)", () => {
    // Pins the current limitation so a future parseDDL fix is noticed: the mssql
    // generator output yields ZERO FK connectors today. When this starts
    // producing FKs, flip mssql into ROUNDTRIP_DIALECTS above.
    const data = importDDL(generateDiagramatixDDL("mssql"), "mssql");
    const fkConns = data.connectors.filter((c) => c.type === "uml-association");
    expect(fkConns.length).toBe(0);
  });
});

describe("DDL round-trip — hand-authored two-table model", () => {
  // A minimal domain model written directly as DDL: an `orders` table with a
  // foreign key to `customers`. Proves the parser/importer reconstruct tables,
  // columns (incl. PK/FK flags) and the relationship from arbitrary SQL.
  // FKs declared as table-level constraints (the form parseDDL handles
  // reliably across dialects).
  const MODEL = `
    CREATE TABLE customers (
      id         INT NOT NULL PRIMARY KEY,
      name       VARCHAR(255) NOT NULL,
      email      VARCHAR(255)
    );
    CREATE TABLE orders (
      id           INT NOT NULL PRIMARY KEY,
      customer_id  INT NOT NULL,
      total        NUMERIC NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
  `;

  it("reconstructs both tables with their columns", () => {
    const data = importDDL(MODEL, "postgres");
    expect(tableNames(data)).toEqual(["customers", "orders"]);

    const custCols = attrs(data, "customers");
    expect(custCols.map((c) => c.name)).toEqual(["id", "name", "email"]);
    expect(custCols.find((c) => c.name === "id")?.primaryKey).toBe(true);
    expect(custCols.find((c) => c.name === "name")?.notNull).toBe(true);

    const orderCols = attrs(data, "orders");
    expect(orderCols.map((c) => c.name)).toEqual(["id", "customer_id", "total"]);
  });

  it("reconstructs the FK as a uml-association connector with multiplicities", () => {
    const data = importDDL(MODEL, "postgres");
    const fk = attrs(data, "orders").find((c) => c.name === "customer_id")!;
    expect(fk.foreignKey).toBe(true);
    expect(fk.fkTable).toBe("customers");
    expect(fk.fkColumn).toBe("id");

    const orders = data.elements.find((e) => e.label === "orders")!;
    const customers = data.elements.find((e) => e.label === "customers")!;
    const conns = data.connectors.filter((c) => c.type === "uml-association");
    expect(conns.length).toBe(1);
    expect(conns[0].sourceId).toBe(orders.id);
    expect(conns[0].targetId).toBe(customers.id);
    // customer_id is not a PK on orders → source multiplicity "*", target "1".
    expect(conns[0].sourceMultiplicity).toBe("*");
    expect(conns[0].targetMultiplicity).toBe("1");
  });

  it("the same model parses in MySQL syntax (backtick ids)", () => {
    // NOTE: SQL Server's bracket-quoted form is intentionally omitted here — a
    // table-level FK whose REFERENCES carries a (col) list truncates the
    // CREATE TABLE body in parseDDL's regex (the same gap that makes the mssql
    // generator round-trip lossy above). MySQL + Postgres are the reliable
    // import dialects.
    const mysql = `
      CREATE TABLE \`customers\` (
        \`id\` INT NOT NULL PRIMARY KEY,
        \`name\` VARCHAR(255) NOT NULL
      );
      CREATE TABLE \`orders\` (
        \`id\` INT NOT NULL PRIMARY KEY,
        \`customer_id\` INT NOT NULL,
        FOREIGN KEY (\`customer_id\`) REFERENCES \`customers\`(\`id\`)
      );
    `;
    const data = importDDL(mysql, "mysql");
    expect(tableNames(data)).toEqual(["customers", "orders"]);
    const fkConns = data.connectors.filter((c) => c.type === "uml-association");
    expect(fkConns.length).toBe(1);
    const orders = data.elements.find((e) => e.label === "orders")!;
    const customers = data.elements.find((e) => e.label === "customers")!;
    expect(fkConns[0].sourceId).toBe(orders.id);
    expect(fkConns[0].targetId).toBe(customers.id);
  });
});
