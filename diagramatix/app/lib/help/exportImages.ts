/**
 * Image Library export — one image downloads as itself; two or more download as a single .zip.
 * File names come from the library's own `filename`, made safe and unique (two captures can share a name).
 */
import JSZip from "jszip";

export interface ExportableImage { id: string; url: string; filename: string; }

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp", "image/svg+xml": "svg",
};

/** A file-system-safe name that keeps (or, from the MIME type, supplies) the extension. */
export function safeImageFilename(filename: string, mime?: string): string {
  const cleaned = filename.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim() || "image";
  if (/\.[A-Za-z0-9]{2,5}$/.test(cleaned)) return cleaned;
  const ext = mime ? EXT_BY_TYPE[mime.toLowerCase()] : undefined;
  return ext ? `${cleaned}.${ext}` : cleaned;
}

/** Make every name unique case-insensitively: "a.png", "a (2).png", "a (3).png". */
export function uniqueNames(names: readonly string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const k = (seen.get(key) ?? 0) + 1;
    seen.set(key, k);
    if (k === 1) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${k})${n.slice(dot)}` : `${n} (${k})`;
  });
}

function saveBlob(blob: Blob, name: string) {
  const a = document.createElement("a");
  const href = URL.createObjectURL(blob);
  a.href = href; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export async function exportImages(images: readonly ExportableImage[]): Promise<void> {
  if (images.length === 0) return;
  const got = await Promise.all(images.map(async (img) => {
    const r = await fetch(img.url);
    if (!r.ok) throw new Error(`"${img.filename}": HTTP ${r.status}`);
    const blob = await r.blob();
    return { blob, name: safeImageFilename(img.filename, blob.type) };
  }));
  if (got.length === 1) { saveBlob(got[0].blob, got[0].name); return; }
  const names = uniqueNames(got.map((g) => g.name));
  const zip = new JSZip();
  got.forEach((g, i) => zip.file(names[i], g.blob));
  saveBlob(await zip.generateAsync({ type: "blob" }), "image-library.zip");
}
