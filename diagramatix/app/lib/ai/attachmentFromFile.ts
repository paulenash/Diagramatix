/**
 * The single place a file becomes a `planBpmn` Attachment.
 *
 * Two things it does that the ad-hoc upload handlers in the editor do not:
 *
 * 1. **It sniffs magic bytes and prefers them over the declared type.** A
 *    caller — especially a machine caller — mislabels things. A PDF announced
 *    as `text/plain` currently gets stringified and sent as prose, which
 *    produces a diagram built from binary noise rather than an error anyone can
 *    act on. The first few bytes of a file are far more trustworthy than a
 *    header somebody's HTTP library guessed.
 *
 * 2. **It handles DOCX.** The type has been in the `accept` list for a long
 *    time while falling through to `file.text()`, so a Word SOP arrived as ZIP
 *    bytes. See `docxToText`.
 *
 * Anything it cannot honestly convert is refused by name, because "we turned
 * your spreadsheet into gibberish and drew it" is a worse outcome than "we do
 * not accept spreadsheets".
 */
import type { Attachment } from "./planBpmn";
import { docxToText } from "@/app/lib/documents/docxToText";

export type AttachmentFailureReason = "unsupported" | "empty";

export interface AttachmentResult {
  ok: true;
  attachment: NonNullable<Attachment>;
  /** True when a long document was cut — the caller should surface it. */
  truncated: boolean;
  /** What we decided it was, after sniffing. Worth reporting when it disagrees
   *  with what the caller said. */
  detected: string;
}
export interface AttachmentFailure {
  ok: false;
  reason: AttachmentFailureReason;
  /** A message written for the caller, naming what we got and what we take. */
  message: string;
}

/** IANA types we send to the vision API, keyed by what we sniffed. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** What the bytes actually are, regardless of what the caller called them. */
export function sniff(buf: Buffer): string | null {
  if (buf.length < 4) return null;
  const ascii = (n: number) => buf.subarray(0, n).toString("latin1");
  if (ascii(5) === "%PDF-") return "pdf";
  if (buf[0] === 0x89 && ascii(4).slice(1) === "PNG") return "png";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpeg";
  if (ascii(6) === "GIF87a" || ascii(6) === "GIF89a") return "gif";
  if (ascii(4) === "RIFF" && buf.length >= 12 && buf.subarray(8, 12).toString("latin1") === "WEBP") return "webp";
  // ZIP container. DOCX, XLSX, PPTX and a plain .zip all start this way, so the
  // declared type still decides WHICH — but knowing it is a container at all is
  // what stops it being read as text.
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "zip";
  // Legacy OLE2 — .doc, .xls. We cannot read these.
  if (buf.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1") return "ole2";
  return null;
}

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Does this look like text rather than binary? Used only as a last resort,
 *  when nothing was sniffed and the declared type is unhelpful. */
function looksTextual(buf: Buffer): boolean {
  const sample = buf.subarray(0, Math.min(buf.length, 4096));
  // A NUL byte in the first few KB means binary in every format we care about.
  if (sample.includes(0)) return false;
  let controls = 0;
  for (const b of sample) {
    if (b < 0x09 || (b > 0x0d && b < 0x20)) controls++;
  }
  return controls / Math.max(1, sample.length) < 0.02;
}

/**
 * Convert an uploaded file into an Attachment.
 *
 * @param buf          the raw bytes
 * @param declaredType the caller's `Content-Type` / `mediaType`, which is a hint
 * @param name         the filename, used only as a tiebreak for ZIP containers
 */
export async function attachmentFromFile(
  buf: Buffer,
  declaredType: string | undefined,
  name?: string,
): Promise<AttachmentResult | AttachmentFailure> {
  if (buf.length === 0) {
    return { ok: false, reason: "empty", message: "That file is empty." };
  }

  const declared = (declaredType ?? "").toLowerCase();
  const lowerName = (name ?? "").toLowerCase();
  const magic = sniff(buf);

  if (magic === "pdf") {
    // PDFs go to the model as a native document block — no local parsing, and
    // the model reads the layout as well as the words.
    return { ok: true, detected: "application/pdf", truncated: false,
      attachment: { type: "pdf", data: buf.toString("base64"), name } };
  }

  if (magic && IMAGE_TYPES[magic]) {
    return { ok: true, detected: IMAGE_TYPES[magic], truncated: false,
      attachment: { type: "image", data: buf.toString("base64"), mediaType: IMAGE_TYPES[magic], name } };
  }

  if (magic === "zip") {
    // Only Word is readable. Decide from the declared type or the extension —
    // the container looks identical for all of them.
    const isDocx = declared === DOCX_MIME || lowerName.endsWith(".docx");
    if (!isDocx) {
      return { ok: false, reason: "unsupported",
        message: "That looks like a zipped Office file we cannot read. Send a PDF, a Word .docx, plain text, or an image of the process." };
    }
    try {
      const { text, truncated } = await docxToText(buf);
      if (!text.trim()) {
        return { ok: false, reason: "empty", message: "That Word document has no readable text in it." };
      }
      return { ok: true, detected: DOCX_MIME, truncated, attachment: { type: "text", data: text, name } };
    } catch {
      return { ok: false, reason: "unsupported",
        message: "That Word document could not be read. Save it as a PDF and try again." };
    }
  }

  if (magic === "ole2") {
    return { ok: false, reason: "unsupported",
      message: "That is an older Office format (.doc / .xls) we cannot read. Save it as .docx or PDF." };
  }

  // Nothing sniffed. Accept it as text only if it actually looks like text —
  // this is the branch that used to swallow anything at all.
  if (looksTextual(buf)) {
    const raw = buf.toString("utf8");
    const { MAX_DOC_CHARS } = await import("@/app/lib/documents/docxToText");
    const truncated = raw.length > MAX_DOC_CHARS;
    const text = truncated ? raw.slice(0, MAX_DOC_CHARS) : raw;
    if (!text.trim()) return { ok: false, reason: "empty", message: "That file has no readable text in it." };
    return { ok: true, detected: declared || "text/plain", truncated, attachment: { type: "text", data: text, name } };
  }

  return { ok: false, reason: "unsupported",
    message: `We cannot read that file${name ? ` (${name})` : ""}. Send a PDF, a Word .docx, plain text, or an image of the process.` };
}
