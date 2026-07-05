/**
 * Document Editor .docx export (Technical Design Notes / User Guide). buildDocx
 * walks GFM Markdown into WordprocessingML; we unzip the result and assert the
 * key structures made it into word/document.xml. Pure — no DB.
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { buildDocx } from "@/app/lib/documents/exportDocx";

const MD = [
  "Intro **bold**, *italic*, `code`, a [link](https://x.com) and a :sym[task]: shortcode.",
  "",
  "- one",
  "- two",
  "",
  "1. first",
  "2. second",
  "",
  "> a quoted line",
  "",
  "```",
  "const x = 1;",
  "```",
  "",
  "| Standard | Direction |",
  "|---|---|",
  "| XES | Import + Export |",
].join("\n");

describe("document .docx export", () => {
  it("T0647 — buildDocx emits a valid docx with chapter title, heading, table + code", async () => {
    const buf = await buildDocx([{ title: "Miner Design", sections: [{ heading: "Overview", bodyMarkdown: MD }] }], { docTitle: "Technical Design Notes" });
    expect(buf.length).toBeGreaterThan(2000);
    const zip = await JSZip.loadAsync(buf);
    const doc = await zip.file("word/document.xml")!.async("string");
    expect(doc).toContain("Technical Design Notes");   // TITLE
    expect(doc).toContain("Miner Design");              // chapter H1
    expect(doc).toContain("Overview");                  // section H2
    expect(doc).toContain("<w:tbl>");                   // the table
    expect(doc).toContain("const x = 1;");              // code fence
    expect(doc).toContain("XES");                        // table cell text
  });

  it("T0648 — :sym[...] shortcodes render as their label (no raw shortcode leaks)", async () => {
    const buf = await buildDocx([{ title: "C", sections: [{ heading: null, bodyMarkdown: "A :sym[gateway]: here." }] }], { docTitle: "Doc" });
    const doc = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    expect(doc).toContain("gateway");
    expect(doc).not.toContain(":sym[");
  });
});
