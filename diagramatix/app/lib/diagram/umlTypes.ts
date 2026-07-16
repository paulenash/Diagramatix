/**
 * UML attribute Type options — the SINGLE source of truth shared by the
 * Properties Panel dropdown and the inline row-editor's assist popup, so the
 * two always match.
 *
 * The list is the primitive types (or the database's column types when the
 * domain diagram targets a physical DB) PLUS the name of every enumeration or
 * «enumeration»/«dataType» class drawn on the diagram.
 */
import type { DiagramElement } from "./types";

export const UML_TYPES = ["String", "Number", "Integer", "Date", "DateTime", "Duration", "Money", "Decimal", "Boolean"];

const POSTGRES_TYPES = [
  "TEXT", "VARCHAR", "CHAR",
  "INT", "BIGINT", "SMALLINT", "SERIAL", "BIGSERIAL",
  "NUMERIC", "DECIMAL", "REAL", "DOUBLE PRECISION",
  "BOOLEAN",
  "DATE", "TIME", "TIMESTAMP", "TIMESTAMPTZ", "INTERVAL",
  "UUID", "JSON", "JSONB", "BYTEA", "INET", "CIDR", "MACADDR",
  "ARRAY", "XML",
];

const MYSQL_TYPES = [
  "VARCHAR", "CHAR", "TEXT", "TINYTEXT", "MEDIUMTEXT", "LONGTEXT",
  "INT", "BIGINT", "SMALLINT", "TINYINT", "MEDIUMINT",
  "DECIMAL", "FLOAT", "DOUBLE",
  "BOOLEAN",
  "DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR",
  "BLOB", "TINYBLOB", "MEDIUMBLOB", "LONGBLOB",
  "ENUM", "SET", "JSON", "BINARY", "VARBINARY",
];

const MSSQL_TYPES = [
  "NVARCHAR", "VARCHAR", "NCHAR", "CHAR", "TEXT", "NTEXT",
  "INT", "BIGINT", "SMALLINT", "TINYINT",
  "NUMERIC", "DECIMAL", "FLOAT", "REAL", "MONEY", "SMALLMONEY",
  "BIT",
  "DATE", "TIME", "DATETIME", "DATETIME2", "SMALLDATETIME", "DATETIMEOFFSET",
  "UNIQUEIDENTIFIER", "XML", "VARBINARY", "IMAGE",
  "SQL_VARIANT", "HIERARCHYID", "GEOGRAPHY", "GEOMETRY",
];

export const DB_TYPE_LISTS: Record<string, string[]> = {
  postgres: POSTGRES_TYPES,
  mysql: MYSQL_TYPES,
  mssql: MSSQL_TYPES,
};

/**
 * The attribute Type options for a domain diagram: base primitive/DB types,
 * plus the name of any enumeration or «enumeration»/«dataType» class on the
 * diagram (an attribute's type may reference one of those). `selfId` excludes
 * the class being edited from its own type list.
 */
export function umlAttributeTypeList(
  database: string | undefined,
  allElements: DiagramElement[] | undefined,
  selfId?: string,
): string[] {
  const baseTypes = (database && database !== "none" && DB_TYPE_LISTS[database]) ? DB_TYPE_LISTS[database] : UML_TYPES;
  const diagramTypes = (allElements ?? [])
    .filter((e) => {
      if (e.id === selfId) return false;
      if (e.type === "uml-enumeration") return true;
      if (e.type === "uml-class") {
        const st = (e.properties?.stereotype as string | undefined) ?? "";
        return st === "enumeration" || st === "dataType";
      }
      return false;
    })
    .map((e) => (e.label ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set([...baseTypes, ...diagramTypes]));
}
