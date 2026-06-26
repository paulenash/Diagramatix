import type JSZip from "jszip";

/**
 * IO-01 — upload / zip-bomb guards (server-only).
 *
 * The Visio-import and backup-restore routes read an uploaded file fully into
 * memory and then decompress it. Two protections:
 *   1. a COMPRESSED-size cap at the route boundary (cheap, stops large uploads);
 *   2. a DECOMPRESSED-size guard after JSZip.loadAsync — a few-KB archive whose
 *      entries inflate to GBs (a "zip bomb") would otherwise OOM the single shared
 *      App Service instance and take every tenant down.
 */

/** Compressed upload cap. Full backups of large orgs can be sizeable, hence 50 MB. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
/** Total declared-uncompressed cap across all archive entries. */
export const MAX_UNZIPPED_BYTES = 250 * 1024 * 1024;

/** Reject an oversized upload BEFORE it is read into memory. Returns an error
 *  string (size too big, or size undeterminable) or null when acceptable. */
export function uploadSizeError(
  file: { size?: number } | null | undefined,
  maxBytes = MAX_UPLOAD_BYTES,
): string | null {
  if (!file) return "No file provided";
  const size = file.size;
  if (typeof size !== "number" || !Number.isFinite(size)) {
    return "Upload size could not be determined";
  }
  if (size > maxBytes) {
    return `File too large: ${(size / 1048576).toFixed(1)} MB (max ${Math.floor(maxBytes / 1048576)} MB)`;
  }
  return null;
}

/** Guard against a zip bomb. `loadAsync` parses the central directory but does
 *  NOT decompress entries, so the declared uncompressed sizes are available up
 *  front — sum them and refuse to extract past the cap. Throws (so the caller's
 *  try/catch surfaces an error) rather than letting `.async()` inflate to GBs. */
export function assertZipWithinLimit(zip: JSZip, maxBytes = MAX_UNZIPPED_BYTES): void {
  let total = 0;
  for (const name of Object.keys(zip.files)) {
    // The uncompressed size lives in JSZip's internal `_data` (central-directory
    // metadata); best-effort — the compressed-size cap still applies if absent.
    const size = (zip.files[name] as unknown as { _data?: { uncompressedSize?: number } })
      ._data?.uncompressedSize;
    if (typeof size === "number" && Number.isFinite(size)) {
      total += size;
      if (total > maxBytes) {
        throw new Error(
          `Archive too large when decompressed (> ${Math.floor(maxBytes / 1048576)} MB) — refusing to extract (possible zip bomb)`,
        );
      }
    }
  }
}
