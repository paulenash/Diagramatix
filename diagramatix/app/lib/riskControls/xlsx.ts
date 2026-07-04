/**
 * Minimal, dependency-light .xlsx writer — a valid OOXML SpreadsheetML zip built
 * by hand with JSZip (same approach as app/lib/diagram/v3/exportVisioV3.ts for
 * .vsdx). Uses inline strings so there's no shared-string table to maintain.
 * Enough for tabular exports like the Risk-Control Matrix; no styling.
 */
import JSZip from "jszip";

export type Cell = string | number | null | undefined;
export interface Sheet {
  name: string;        // shown on the tab (sanitised to <=31 chars, no []:*?/\)
  rows: Cell[][];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const sheetName = (s: string) => (s.replace(/[[\]:*?/\\]/g, " ").trim() || "Sheet").slice(0, 31);

/** 0 → "A", 25 → "Z", 26 → "AA". */
function colRef(i: number): string {
  let s = "", n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

function cellXml(c: Cell, ref: string): string {
  if (c === null || c === undefined || c === "") return `<c r="${ref}"/>`;
  if (typeof c === "number" && Number.isFinite(c)) return `<c r="${ref}"><v>${c}</v></c>`;
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(String(c))}</t></is></c>`;
}

function sheetXml(rows: Cell[][]): string {
  const body = rows.map((row, r) =>
    `<row r="${r + 1}">${row.map((c, i) => cellXml(c, `${colRef(i)}${r + 1}`)).join("")}</row>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

export async function buildXlsx(sheets: Sheet[]): Promise<Buffer> {
  const zip = new JSZip();
  const names = sheets.map((s) => sheetName(s.name));

  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);

  zip.file("_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);

  zip.file("xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);

  zip.file("xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);

  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s.rows)));

  return zip.generateAsync({ type: "nodebuffer" });
}
