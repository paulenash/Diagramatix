/**
 * Sanitise a user-controlled name (diagram / project title) for safe use inside
 * a `Content-Disposition: attachment; filename="…"` header.
 *
 * IO-07: the raw name was interpolated straight into the header. A name
 * containing a double-quote or CR/LF could break out of the quoted filename and
 * inject additional response headers, and `\ / : * ? < > |` are invalid in
 * Windows/macOS filenames. Strip control characters (the header-injection
 * vector) and the filename-invalid set, collapse whitespace, and cap the length.
 */
export function safeExportName(name: string | null | undefined, fallback = "diagram"): string {
  // Drop control characters (0x00–0x1F and 0x7F) without embedding a raw
  // control-char regex literal in source.
  const stripped = Array.from(name ?? "")
    .map((ch) => {
      const code = ch.codePointAt(0)!;
      return code < 0x20 || code === 0x7f ? " " : ch;
    })
    .join("");
  return stripped
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}
