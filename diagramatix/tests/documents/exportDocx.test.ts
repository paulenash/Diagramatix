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

  it("T2213 — a figure renders on its own portrait + landscape pages, aspect preserved", async () => {
    // A wide 200×50 (4:1) figure. A fake resolver supplies the bytes + true size, so
    // the figure-page logic (not PNG parsing) is what's under test.
    const resolver = async () => ({ data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), width: 200, height: 50, type: "png" as const });
    const buf = await buildDocx(
      [{ title: "Purpose", sections: [{ heading: null, bodyMarkdown: "Do the thing." }] }],
      { docTitle: "SOP", imageResolver: resolver, figure: { dataUri: "data:image/png;base64,iVBORw0", caption: "Fragment" } },
    );
    const doc = await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string");
    // Two figure pages → two embedded images.
    expect((doc.match(/<w:drawing>/g) ?? []).length).toBe(2);
    // One of the sections is landscape.
    expect(doc).toContain('w:orient="landscape"');
    // Both images keep the 4:1 aspect ratio (cx/cy ≈ 4) — never compressed.
    const ratios = [...doc.matchAll(/<wp:extent cx="(\d+)" cy="(\d+)"/g)].map((m) => Number(m[1]) / Number(m[2]));
    expect(ratios.length).toBe(2);
    for (const r of ratios) expect(Math.abs(r - 4)).toBeLessThan(0.05);
  });
});
