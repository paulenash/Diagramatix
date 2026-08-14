/**
 * SSRF guard for a live mining source's blob URL (MINE-01).
 *
 * `pollBlobSource` fetches a URL stored on the MiningSource, which a project
 * editor sets. Without validation, an editor could point it at
 * `http://169.254.169.254/…` (cloud metadata) or an internal service and have
 * the SERVER fetch it — a classic SSRF that turns edit access into an egress
 * primitive.
 *
 * A blob source is, by definition, an Azure Blob Storage container SAS URL, so
 * the tightest and simplest defence is a host allow-list of the Azure Storage
 * endpoints. This is stronger than a private-IP block: an attacker cannot make
 * `anything.blob.core.windows.net` resolve to a private address (they don't
 * control Azure Storage DNS), so the metadata / internal-host vector is closed
 * outright — no DNS-rebinding TOCTOU to worry about. https is required too.
 */

/** Azure Blob Storage host suffixes across the public + sovereign clouds. */
const AZURE_BLOB_SUFFIXES = [
  ".blob.core.windows.net",       // public
  ".blob.core.chinacloudapi.cn",  // Azure China
  ".blob.core.usgovcloudapi.net", // Azure US Government
  ".blob.core.cloudapi.de",       // Azure Germany (legacy)
];

export class UnsafeBlobUrlError extends Error {
  constructor(message: string) { super(message); this.name = "UnsafeBlobUrlError"; }
}

/**
 * Throw {@link UnsafeBlobUrlError} unless `raw` is a well-formed `https` URL
 * whose host is an Azure Blob Storage endpoint. Returns the parsed URL on
 * success so callers can reuse it.
 */
export function assertSafeBlobUrl(raw: unknown): URL {
  if (typeof raw !== "string" || !raw.trim()) {
    throw new UnsafeBlobUrlError("Blob URL is required");
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new UnsafeBlobUrlError("Blob URL is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new UnsafeBlobUrlError("Blob URL must use https");
  }
  const host = url.hostname.toLowerCase();
  // An IP-literal host can never be a valid Azure Storage hostname; reject
  // explicitly so a numeric internal address can't slip through a parser quirk.
  const isIpLiteral = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host.startsWith("[");
  if (isIpLiteral || !AZURE_BLOB_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new UnsafeBlobUrlError("Blob URL must be an Azure Blob Storage endpoint (…blob.core.windows.net)");
  }
  return url;
}

/** Non-throwing variant for save-time validation → returns an error message. */
export function validateBlobUrl(raw: unknown): string | null {
  try {
    assertSafeBlobUrl(raw);
    return null;
  } catch (e) {
    return e instanceof UnsafeBlobUrlError ? e.message : "Invalid blob URL";
  }
}
