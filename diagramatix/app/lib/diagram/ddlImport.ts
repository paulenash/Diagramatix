/**
 * Parse a SQL DDL file and produce a DiagramData for a Domain Diagram.
 * Supports PostgreSQL dialect.
 */

import type { DiagramData, DiagramElement, Connector, Point, UmlAttribute } from "./types";

interface ParsedColumn {
  name: string;
  type: string;
  notNull: boolean;
  primaryKey: boolean;
  foreignKey: boolean;
  fkTable?: string;
  fkColumn?: string;
}

interface ParsedTable {
  name: string;
  columns: ParsedColumn[];
  isEnum: boolean; // INSERT-only table with a single "code" column → enumeration
  enumValues: string[];
}

// ── Parser ──────────────────────────────────────────────────────────

export function parseDDL(sql: string): ParsedTable[] {
  const tables: ParsedTable[] = [];
  // Normalise line endings
  const text = sql.replace(/\r\n/g, "\n");

  // Extract CREATE TABLE blocks
  const createRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*?)\);/gi;
  let m;
  while ((m = createRe.exec(text)) !== null) {
    const tableName = m[1];
    const body = m[2];
    const columns: ParsedColumn[] = [];

    // Track table-level PKs and FKs
    const tablePKs = new Set<string>();
    const tableFKs = new Map<string, { table: string; column: string }>();

    // Split body by commas, but respect parentheses
    const parts = splitTopLevel(body);

    for (const raw of parts) {
      const part = raw.trim();
      if (!part) continue;

      // Table-level PRIMARY KEY
      const pkMatch = part.match(/^\s*PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        for (const col of pkMatch[1].split(",")) tablePKs.add(col.trim().replace(/"/g, ""));
        continue;
      }

      // Table-level FOREIGN KEY
      const fkMatch = part.match(/^\s*(?:CONSTRAINT\s+\w+\s+)?FOREIGN\s+KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      if (fkMatch) {
        tableFKs.set(fkMatch[1], { table: fkMatch[2], column: fkMatch[3] });
        continue;
      }

      // Table-level UNIQUE, CHECK, INDEX — skip
      if (/^\s*(UNIQUE|CHECK|INDEX|CONSTRAINT)/i.test(part)) continue;

      // Column definition
      const colMatch = part.match(/^\s*"?(\w+)"?\s+(\w[\w\s()]*?)(?:\s+(NOT\s+NULL|NULL|DEFAULT|PRIMARY\s+KEY|REFERENCES|UNIQUE|CHECK).*)?\s*$/i);
      if (!colMatch) continue;

      const colName = colMatch[1];
      let colType = colMatch[2].trim().toUpperCase();
      const rest = part.substring(colMatch.index! + colMatch[0].indexOf(colMatch[2]) + colMatch[2].length);

      // Clean up type
      colType = colType.replace(/\s+/g, " ");

      const notNull = /NOT\s+NULL/i.test(rest);
      const isPK = /PRIMARY\s+KEY/i.test(rest);
      let fkTable: string | undefined;
      let fkColumn: string | undefined;
      const refMatch = rest.match(/REFERENCES\s+(\w+)\s*\((\w+)\)/i);
      if (refMatch) {
        fkTable = refMatch[1];
        fkColumn = refMatch[2];
      }

      columns.push({
        name: colName,
        type: colType,
        notNull: notNull || isPK,
        primaryKey: isPK,
        foreignKey: !!fkTable,
        fkTable,
        fkColumn,
      });
    }

    // Apply table-level PK/FK
    for (const col of columns) {
      if (tablePKs.has(col.name)) { col.primaryKey = true; col.notNull = true; }
      const fk = tableFKs.get(col.name);
      if (fk) { col.foreignKey = true; col.fkTable = fk.table; col.fkColumn = fk.column; }
    }

    tables.push({ name: tableName, columns, isEnum: false, enumValues: [] });
  }

  // Detect enumeration tables: tables with just a single PK "code" column + INSERT values
  const insertRe = /INSERT\s+INTO\s+(\w+)\s*\([^)]*\)\s*VALUES\s*([\s\S]*?);/gi;
  const inserts = new Map<string, string[]>();
  while ((m = insertRe.exec(text)) !== null) {
    const tbl = m[1];
    const valBlock = m[2];
    const vals: string[] = [];
    const valRe = /\(\s*'([^']*)'\s*\)/g;
    let vm;
    while ((vm = valRe.exec(valBlock)) !== null) vals.push(vm[1]);
    if (vals.length > 0) inserts.set(tbl, vals);
  }

  for (const t of tables) {
    if (t.columns.length === 1 && t.columns[0].name === "code" && inserts.has(t.name)) {
      t.isEnum = true;
      t.enumValues = inserts.get(t.name)!;
    }
  }

  return tables;
}

/** Split a string by commas at the top level (not inside parentheses) */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (s[i] === "," && depth === 0) {
      parts.push(s.substring(start, i));
      start = i + 1;
    }
  }
  parts.push(s.substring(start));
  return parts;
}

// ── Diagram Generator ───────────────────────────────────────────────

const CHAR_W = 6.5;
const LINE_H = 14;
const BASE_HEADER_H = 28;
const STEREO_H = 11;
const PAD = 4;
const MIN_W = 80;
const MIN_H = 40;

export function generateDiagramFromDDL(
  parsedTables: ParsedTable[],
  databaseType: string,
): DiagramData {
  let nextId = 1;
  const mkId = () => `el-${nextId++}`;
  const mkConnId = () => `cn-${nextId++}`;

  const elements: DiagramElement[] = [];
  const connectors: Connector[] = [];
  const elementMap: Record<string, string> = {};

  const entityTables = parsedTables.filter(t => !t.isEnum);
  const enumTables = parsedTables.filter(t => t.isEnum);

  // Compute sizes
  function classWidth(t: ParsedTable): number {
    const stereoW = "«table»".length * CHAR_W * 0.8;
    let maxW = Math.max(stereoW, t.name.length * CHAR_W);
    for (const c of t.columns) {
      let s = `+ ${c.name} : ${c.type}`;
      if (c.notNull) s += " [1]";
      if (c.primaryKey) s += " {PK}";
      if (c.foreignKey && c.fkTable) s += ` {FK → ${c.fkTable}}`;
      maxW = Math.max(maxW, s.length * CHAR_W);
    }
    return Math.max(MIN_W, Math.ceil(maxW + PAD * 2));
  }

  function classHeight(t: ParsedTable): number {
    return Math.max(MIN_H, BASE_HEADER_H + STEREO_H + t.columns.length * LINE_H + 18);
  }

  function enumWidth(t: ParsedTable): number {
    const stereoW = "«enumeration»".length * CHAR_W * 0.8;
    let maxW = Math.max(stereoW, t.name.length * CHAR_W);
    for (const v of t.enumValues) maxW = Math.max(maxW, v.length * CHAR_W);
    return Math.max(MIN_W, Math.ceil(maxW + PAD * 2));
  }

  function enumHeight(t: ParsedTable): number {
    return Math.max(MIN_H, BASE_HEADER_H + STEREO_H + t.enumValues.length * LINE_H);
  }

  // Layout entity tables in 4-column grid
  let col = 0, curX = 100, curY = 100, rowH = 0;
  for (const t of entityTables) {
    const w = classWidth(t);
    const h = classHeight(t);
    if (col >= 4) { col = 0; curX = 100; curY += rowH + 40; rowH = 0; }
    const id = mkId();
    elementMap[t.name] = id;
    elements.push({
      id, type: "uml-class",
      x: curX, y: curY, width: w, height: h,
      label: t.name,
      properties: {
        showAttributes: true, showOperations: false,
        stereotype: "table", showStereotype: true,
        attributes: t.columns.map((c): UmlAttribute => ({
          visibility: "+",
          name: c.name,
          type: c.type,
          ...(c.notNull ? { notNull: true } : {}),
          ...(c.primaryKey ? { primaryKey: true } : {}),
          ...(c.foreignKey ? { foreignKey: true, fkTable: c.fkTable, fkColumn: c.fkColumn } : {}),
        })),
      },
    });
    rowH = Math.max(rowH, h);
    curX += w + 60;
    col++;
  }

  // Layout enumerations in 5-column grid to the right
  let enumCol = 0, enumX = 2200, enumY = 100, enumRowH = 0;
  for (const t of enumTables) {
    const w = enumWidth(t);
    const h = enumHeight(t);
    if (enumCol >= 5) { enumCol = 0; enumX = 2200; enumY += enumRowH + 40; enumRowH = 0; }
    const id = mkId();
    elementMap[t.name] = id;
    elements.push({
      id, type: "uml-enumeration",
      x: enumX, y: enumY, width: w, height: h,
      label: t.name,
      properties: { stereotype: "enumeration", showStereotype: true, values: t.enumValues },
    });
    enumRowH = Math.max(enumRowH, h);
    enumX += w + 60;
    enumCol++;
  }

  // Create FK connectors
  for (const t of entityTables) {
    const srcId = elementMap[t.name];
    if (!srcId) continue;
    for (const c of t.columns) {
      if (!c.foreignKey || !c.fkTable) continue;
      const tgtId = elementMap[c.fkTable];
      if (!tgtId || srcId === tgtId) continue;
      connectors.push({
        id: mkConnId(),
        sourceId: srcId, targetId: tgtId,
        sourceSide: "right", targetSide: "left",
        type: "uml-association",
        directionType: "non-directed",
        routingType: "rectilinear",
        sourceInvisibleLeader: false,
        targetInvisibleLeader: false,
        waypoints: [] as Point[],
        sourceMultiplicity: c.primaryKey ? "1" : "*",
        targetMultiplicity: "1",
      } as Connector);
    }
  }

  return {
    elements,
    connectors,
    viewport: { x: 0, y: 0, zoom: 0.5 },
    title: { version: "1.5", authors: "Imported from DDL", status: "draft", showTitle: true },
    fontSize: 12,
    connectorFontSize: 10,
    titleFontSize: 14,
    database: databaseType,
  };
}
