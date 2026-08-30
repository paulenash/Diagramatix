/**
 * DOCX → plain text, server-side.
 *
 * Closes a real bug rather than adding a feature. `.docx` has been in the
 * attachment `accept` list for a long time, but the upload path falls through to
 * `file.text()` for anything that is not a PDF or an image — so a Word document
 * arrives at the model as stringified ZIP bytes. It does not fail loudly; it
 * produces a diagram from garbage.
 *
 * `mammoth` is already a dependency (used lazily by the file preview dialog), so
 * this costs nothing new. It is imported lazily here too: the library is only
 * needed when somebody actually uploads a Word file, and a partner API route
 * should not pay for it on every cold start.
 */

/** Rough ceiling on what we will hand a model. A 200k-character SOP is already
 *  far beyond what a single BPMN diagram can usefully represent, and sending
 *  more just costs tokens and invites the model to summarise. */
export const MAX_DOC_CHARS = 200_000;

export interface DocxToTextResult {
  text: string;
  /** True when the document was longer than MAX_DOC_CHARS and was cut. The
   *  caller should say so rather than silently pretending it read all of it. */
  truncated: boolean;
}

export async function docxToText(buf: Buffer): Promise<DocxToTextResult> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.extractRawText({ buffer: buf });

  // Word emits a lot of empty paragraphs. Collapsing runs of blank lines keeps
  // the structure a reader would see without spending tokens on whitespace.
  const cleaned = value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned.length > MAX_DOC_CHARS
    ? { text: cleaned.slice(0, MAX_DOC_CHARS), truncated: true }
    : { text: cleaned, truncated: false };
}
