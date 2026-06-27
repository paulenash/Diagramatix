/**
 * Allowed image formats for the User Guide image library — restricted to formats
 * every major browser can render in an <img> tag (so a stored image never shows
 * as a broken image). TIFF, HEIC/HEIF, PSD, RAW, etc. are rejected at upload.
 *
 * Single source of truth for the upload <input accept>, the server-side guard,
 * and the tests.
 */
export const ALLOWED_IMAGE_MIME = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
  "image/svg+xml",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export const ALLOWED_IMAGE_EXT = new Set<string>([
  "png", "jpg", "jpeg", "gif", "webp", "avif", "svg", "bmp", "ico",
]);

/** `accept` attribute for the upload file input — both extensions and MIME types
 *  so the OS picker filters consistently across platforms. */
export const IMAGE_ACCEPT =
  ".png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.bmp,.ico," +
  "image/png,image/jpeg,image/gif,image/webp,image/avif,image/svg+xml,image/bmp,image/x-icon";

/** Human-readable list for error messages. */
export const ALLOWED_IMAGE_LABEL = "PNG, JPEG, GIF, WebP, AVIF, SVG, BMP, ICO";

/**
 * Is this upload a browser-displayable image we accept? A concrete `image/*`
 * MIME type is authoritative (so `image/tiff` is rejected even if the name says
 * `.png`); an empty or generic type (e.g. `application/octet-stream`) falls back
 * to the file extension.
 */
export function isAllowedImage(mimeType: string | null | undefined, filename: string | null | undefined): boolean {
  const mt = (mimeType ?? "").toLowerCase().trim();
  if (mt.startsWith("image/")) return ALLOWED_IMAGE_MIME.has(mt);
  const ext = (filename ?? "").toLowerCase().split(".").pop() ?? "";
  return ALLOWED_IMAGE_EXT.has(ext);
}
