/**
 * Physical DDL assembler (buildPhysicalDdl): given catalog introspection rows,
 * emits faithful PostgreSQL DDL — enums, tables (native types, NOT NULL,
 * defaults), PK/unique/FK constraints and indexes (with the ones backing a
 * constraint filtered out). Pure — a mock query fn stands in for the pool.
 */
import { describe, it, expect } from "vitest";
import { buildPhysicalDdl, type QueryFn } from "@/app/lib/diagram/physicalDdl";

const mock: QueryFn = async (sql: string) => {
  if (sql.includes("pg_enum")) return { rows: [
    { name: "Kind", label: "A" }, { name: "Kind", label: "B" },
  ] };
  if (sql.includes("pg_attribute")) return { rows: [
    { table: "Widget", column: "id", type: "text", notnull: true, default: null },
    { table: "Widget", column: "count", type: "integer", notnull: true, default: "0" },
    { table: "Widget", column: "kind", type: "\"Kind\"", notnull: false, default: null },
  ] };
  if (sql.includes("pg_constraint")) return { rows: [
    { name: "Widget_pkey", type: "p", table: "\"Widget\"", def: "PRIMARY KEY (id)" },
    { name: "Widget_ownerId_fkey", type: "f", table: "\"Widget\"", def: "FOREIGN KEY (\"ownerId\") REFERENCES \"User\"(id) ON DELETE CASCADE" },
  ] };
  if (sql.includes("pg_indexes")) return { rows: [
    { name: "Widget_pkey", def: "CREATE UNIQUE INDEX \"Widget_pkey\" ON public.\"Widget\" USING btree (id)" },
    { name: "Widget_count_idx", def: "CREATE INDEX \"Widget_count_idx\" ON public.\"Widget\" USING btree (count)" },
  ] };
  return { rows: [] };
};

describe("physical DDL assembler", () => {
  it("T0658 — emits enums, table columns, constraints and indexes; filters constraint-backing indexes", async () => {
    const ddl = await buildPhysicalDdl(mock, new Date("2026-07-07T00:00:00Z"));

    // Enum
    expect(ddl).toContain(`CREATE TYPE "Kind" AS ENUM ('A', 'B');`);
    // Table + columns with type / NOT NULL / DEFAULT
    expect(ddl).toContain(`CREATE TABLE "Widget" (`);
    expect(ddl).toContain(`  "id" text NOT NULL`);
    expect(ddl).toContain(`  "count" integer NOT NULL DEFAULT 0`);
    expect(ddl).toContain(`  "kind" "Kind"`);
    // PK as ALTER
    expect(ddl).toContain(`ALTER TABLE "Widget" ADD CONSTRAINT "Widget_pkey" PRIMARY KEY (id);`);
    // FK in its own section
    expect(ddl).toContain(`ADD CONSTRAINT "Widget_ownerId_fkey" FOREIGN KEY`);
    // The real secondary index is kept…
    expect(ddl).toContain(`CREATE INDEX "Widget_count_idx"`);
    // …but the index backing the PK constraint is filtered out.
    expect(ddl).not.toContain(`CREATE UNIQUE INDEX "Widget_pkey"`);
  });
});
