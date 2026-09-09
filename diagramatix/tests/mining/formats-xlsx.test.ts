/**
 * Phase 2.1 — reading the format people actually have.
 *
 * The picker took CSV, TSV, XES, OCEL and XML — everything except `.xlsx`. The
 * fixtures here are built as real workbooks with jszip rather than checked in as
 * binaries, so what is under test is the parser and not a blob nobody can read
 * in a diff.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { parseXlsx, columnIndex } from "@/app/lib/mining/formats/xlsx";
import { buildEventLog, guessMapping, parseTimestamp } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

/** A cell: string values go through the shared-string table, like Excel's own. */
type Cell = { v: string; s?: true } | null;

async function workbook(sheets: { name: string; rows: Cell[][] }[]): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const shared: string[] = [];
  const sidx = (t: string) => { const i = shared.indexOf(t); return i >= 0 ? i : shared.push(t) - 1; };
  const col = (n: number) => { let s = "", x = n + 1; while (x > 0) { const r = (x - 1) % 26; s = String.fromCharCode(65 + r) + s; x = Math.floor((x - 1) / 26); } return s; };

  const sheetXml = sheets.map(({ rows }) =>
    `<worksheet><sheetData>${rows.map((cells, r) =>
      `<row r="${r + 1}">${cells.map((c, i) => {
        if (c === null) return "";                       // absent cell, as Excel writes it
        return c.s
          ? `<c r="${col(i)}${r + 1}" t="s"><v>${sidx(c.v)}</v></c>`
          : `<c r="${col(i)}${r + 1}"><v>${c.v}</v></c>`;
      }).join("")}</row>`).join("")}</sheetData></worksheet>`);

  sheets.forEach((_, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml[i]));
  zip.file("xl/workbook.xml",
    `<workbook><sheets>${sheets.map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels",
    `<Relationships>${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  zip.file("xl/sharedStrings.xml", `<sst>${shared.map((t) => `<si><t>${t}</t></si>`).join("")}</sst>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

const s = (v: string): Cell => ({ v, s: true });
const n = (v: number | string): Cell => ({ v: String(v) });

describe("Phase 2.1 — reading an .xlsx", () => {
  it("T3647 - a plain sheet becomes headers and rows", async () => {
    const buf = await workbook([{
      name: "Log",
      rows: [
        [s("Case"), s("Activity"), s("When")],
        [s("c1"), s("Receive"), s("2026-01-01T09:00:00Z")],
        [s("c1"), s("Approve"), s("2026-01-02T09:00:00Z")],
      ],
    }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.name).toBe("Log");
    expect(sheet.headers).toEqual(["Case", "Activity", "When"]);
    expect(sheet.rows).toEqual([
      ["c1", "Receive", "2026-01-01T09:00:00Z"],
      ["c1", "Approve", "2026-01-02T09:00:00Z"],
    ]);
  });

  it("T3648 - a sparse row keeps its columns aligned", async () => {
    // Excel omits empty cells entirely. Counting <c> elements instead of reading
    // their r="B3" reference shifts every later value one column left — which
    // would silently put activities in the timestamp column.
    const buf = await workbook([{
      name: "S",
      rows: [
        [s("A"), s("B"), s("C")],
        [s("a1"), null, s("c1")],
      ],
    }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.rows[0]).toEqual(["a1", "", "c1"]);
  });

  it("T3649 - a blank row in the middle does not shift the rows after it", async () => {
    const buf = await workbook([{
      name: "S",
      rows: [[s("A")], [s("r1")], [], [s("r3")]],
    }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.rows).toEqual([["r1"], ["r3"]]);   // the blank is dropped, not shifted
  });

  it("T3650 - the header row is the first row with anything in it", async () => {
    // Exported sheets often carry a blank line, or a title, above the table.
    const buf = await workbook([{
      name: "S",
      rows: [[], [s("Case"), s("Activity")], [s("c1"), s("Receive")]],
    }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.headers).toEqual(["Case", "Activity"]);
    expect(sheet.rows).toEqual([["c1", "Receive"]]);
  });

  it("T3651 - an unnamed column still gets a name, so it can be mapped", async () => {
    const buf = await workbook([{ name: "S", rows: [[s("Case"), null, s("When")], [s("c1"), s("x"), s("2026-01-01")]] }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.headers).toEqual(["Case", "Column 2", "When"]);
  });

  it("T3652 - every sheet is returned, in workbook order", async () => {
    const buf = await workbook([
      { name: "First", rows: [[s("A")], [s("1")]] },
      { name: "Second", rows: [[s("B")], [s("2")]] },
    ]);
    const sheets = await parseXlsx(buf);
    expect(sheets.map((x) => x.name)).toEqual(["First", "Second"]);
  });
});

describe("Phase 2.1 — dates", () => {
  it("T3653 - an Excel serial date is handed through and read by the existing pipeline", async () => {
    // Deliberately NOT interpreted here. A styled date cell is just a number
    // plus a format id, and chasing numFmt through the style table is where this
    // kind of reader usually goes wrong. parseTimestamp has understood serials
    // since long before this module existed.
    const serial = 46023;                        // 2026-01-01
    expect(parseTimestamp(String(serial))).not.toBeNull();
    const buf = await workbook([{
      name: "S",
      rows: [[s("Case"), s("Activity"), s("When")], [s("c1"), s("Receive"), n(serial)]],
    }]);
    const [sheet] = await parseXlsx(buf);
    expect(sheet.rows[0][2]).toBe(String(serial));
    const log = buildEventLog(sheet.headers, sheet.rows, guessMapping(sheet.headers) as LogMapping);
    expect(log.stats.events).toBe(1);
    expect(new Date(log.traces[0].events[0].timestamp).getUTCFullYear()).toBe(2026);
  });
});

describe("Phase 2.1 — the workbook feeds the ordinary pipeline", () => {
  it("T3654 - an .xlsx log mines exactly as the same data in CSV would", async () => {
    const rows = [
      ["c1", "Receive", "2026-01-01T09:00:00Z"],
      ["c1", "Approve", "2026-01-02T09:00:00Z"],
      ["c2", "Receive", "2026-01-01T10:00:00Z"],
    ];
    const buf = await workbook([{
      name: "Log",
      rows: [[s("Case"), s("Activity"), s("When")], ...rows.map((r) => r.map(s))],
    }]);
    const [sheet] = await parseXlsx(buf);
    const headers = ["Case", "Activity", "When"];
    const fromXlsx = buildEventLog(sheet.headers, sheet.rows, guessMapping(sheet.headers) as LogMapping);
    const fromCsv = buildEventLog(headers, rows, guessMapping(headers) as LogMapping);
    expect(fromXlsx.stats).toEqual(fromCsv.stats);
    expect(fromXlsx.variants).toEqual(fromCsv.variants);
  });

  it("T3655 - a file that is not a workbook fails with something a user can act on", async () => {
    const zip = new JSZip();
    zip.file("hello.txt", "not a workbook");
    await expect(parseXlsx(await zip.generateAsync({ type: "arraybuffer" }))).rejects.toThrow(/workbook/i);
  });
});

describe("Phase 2.1 — column references", () => {
  it("T3656 - a reference past Z resolves correctly", () => {
    // A wide export really does reach AA and beyond, and getting this wrong
    // misplaces every column after the 26th.
    expect(columnIndex("A1")).toBe(0);
    expect(columnIndex("Z9")).toBe(25);
    expect(columnIndex("AA1")).toBe(26);
    expect(columnIndex("BC12")).toBe(54);
  });
});
