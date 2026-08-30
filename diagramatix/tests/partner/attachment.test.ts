/**
 * Partner API — turning an uploaded file into something a model can read.
 *
 * Two defects this closes, both of which fail SILENTLY today:
 *
 *  - `.docx` is in the editor's `accept` list but falls through to
 *    `file.text()`, so a Word SOP reaches the model as stringified ZIP bytes and
 *    produces a diagram built from noise. T2964 asserts the words are there and
 *    the ZIP magic is not.
 *  - The declared content type is taken on trust. A machine caller mislabels
 *    things, and a PDF announced as `text/plain` was being stringified the same
 *    way. T2965 sniffs the bytes instead.
 *
 * Refusing a file we cannot read is a FEATURE here: "we turned your spreadsheet
 * into gibberish and drew it" is worse than "we do not accept spreadsheets".
 */
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { attachmentFromFile, sniff } from "@/app/lib/ai/attachmentFromFile";
import { MAX_DOC_CHARS } from "@/app/lib/documents/docxToText";

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** A real, minimal .docx — a ZIP with the parts mammoth needs. */
async function makeDocx(paragraphs: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `</Types>`);
  zip.folder("_rels")!.file(".rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `</Relationships>`);
  const body = paragraphs.map((t) => `<w:p><w:r><w:t>${t}</w:t></w:r></w:p>`).join("");
  zip.folder("word")!.file("document.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

const PDF = Buffer.from("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n", "latin1");
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

describe("attachmentFromFile", () => {
  it("T2963 — a PDF becomes a pdf attachment, sent whole to the model", async () => {
    const r = await attachmentFromFile(PDF, "application/pdf", "sop.pdf");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachment.type).toBe("pdf");
    expect(Buffer.from(r.attachment.data, "base64").subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("T2964 — a DOCX becomes TEXT containing its words, and not its ZIP bytes", async () => {
    // The defect: this used to arrive as `PK\x03\x04…` stringified.
    const docx = await makeDocx(["Receive the invoice", "Check it against the purchase order"]);
    const r = await attachmentFromFile(docx, DOCX_MIME, "SOP.docx");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachment.type).toBe("text");
    expect(r.attachment.data).toContain("Receive the invoice");
    expect(r.attachment.data).toContain("purchase order");
    expect(r.attachment.data.startsWith("PK")).toBe(false);
    expect(r.attachment.data).not.toContain("[Content_Types]");
  });

  it("T2965 — the BYTES win over a wrong declared type", async () => {
    // A caller mislabelling a PDF as text used to have it stringified.
    const r = await attachmentFromFile(PDF, "text/plain", "notes.txt");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.attachment.type).toBe("pdf");

    // …and the same for an image announced as a document.
    const i = await attachmentFromFile(PNG, "application/pdf", "shot.pdf");
    expect(i.ok).toBe(true);
    if (i.ok) expect(i.attachment.type).toBe("image");
  });

  it("T2966 — what we cannot read is REFUSED by name, not mangled", async () => {
    const zip = await new JSZip().file("a.txt", "hi").generateAsync({ type: "nodebuffer" });
    const asZip = await attachmentFromFile(zip, "application/zip", "stuff.zip");
    expect(asZip.ok).toBe(false);
    if (!asZip.ok) expect(asZip.message).toMatch(/PDF|Word|text|image/i);

    // Legacy binary Office. Recognisable, and honestly refused.
    const doc = Buffer.concat([Buffer.from("d0cf11e0a1b11ae1", "hex"), Buffer.alloc(64)]);
    const asDoc = await attachmentFromFile(doc, "application/msword", "old.doc");
    expect(asDoc.ok).toBe(false);
    if (!asDoc.ok) expect(asDoc.message).toMatch(/\.docx|PDF/i);

    // Arbitrary binary with no signature must not slip through as "text".
    const noise = Buffer.from([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x7f]);
    const asNoise = await attachmentFromFile(noise, "application/octet-stream", "x.bin");
    expect(asNoise.ok).toBe(false);
  });

  it("T2967 — plain text and markdown come through as text", async () => {
    const r = await attachmentFromFile(Buffer.from("Step 1: receive\nStep 2: check\n"), "text/plain", "p.txt");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.attachment.type).toBe("text");
      expect(r.attachment.data).toContain("Step 1");
    }
  });

  it("T2968 — an over-long document is cut, and SAYS it was cut", async () => {
    // Silently truncating and reporting success would let a caller believe the
    // whole thing was modelled.
    const long = Buffer.from("a. ".repeat(MAX_DOC_CHARS));
    const r = await attachmentFromFile(long, "text/plain", "huge.txt");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.truncated).toBe(true);
    expect(r.attachment.type === "text" && r.attachment.data.length).toBeLessThanOrEqual(MAX_DOC_CHARS);
  });

  it("T2969 — an empty file is refused, not sent as an empty prompt", async () => {
    const r = await attachmentFromFile(Buffer.alloc(0), "application/pdf", "nothing.pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("empty");
  });

  it("T2970 — sniff recognises the formats it claims to", () => {
    expect(sniff(PDF)).toBe("pdf");
    expect(sniff(PNG)).toBe("png");
    expect(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniff(Buffer.from("GIF89a....", "latin1"))).toBe("gif");
    expect(sniff(Buffer.from("PK\x03\x04....", "latin1"))).toBe("zip");
    expect(sniff(Buffer.from("hello, world", "latin1"))).toBeNull();
  });
});
