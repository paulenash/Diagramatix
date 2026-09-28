/**
 * A photo of a whiteboard, made ready for the AI on the phone itself
 * (2026-09-28, mobile voice stage 2).
 *
 * The model reads an image at up to 2576px on its long edge AND about 3.75
 * megapixels (~4784 visual tokens) — beyond that the API shrinks it anyway, so
 * sending more only costs upload time on a phone connection. For a 4:3 phone
 * photo the area cap is the one that binds: 4032×3024 → 2236×1677.
 *
 * Always re-encoded as JPEG, whatever arrives: that turns an iPhone's HEIC into
 * something every browser and the model can read, applies the photo's EXIF
 * rotation (the browser draws it upright), and drops its EXIF — including the
 * GPS position of the whiteboard — from the copy that is kept.
 *
 * `fitPhoto` and `photoName` are pure; `shrinkPhoto` needs a browser.
 */

export const PHOTO_MAX_EDGE = 2576;
export const PHOTO_MAX_PIXELS = 3_750_000;
export const PHOTO_JPEG_QUALITY = 0.85;
/** Anything larger is refused before it is decoded. */
export const PHOTO_MAX_INPUT_BYTES = 50 * 1024 * 1024;
/** The most a shrunk photo may weigh: base64 of it stays under the model's 5 MB per image. */
export const PHOTO_MAX_OUTPUT_BYTES = Math.floor(3.5 * 1024 * 1024);
/** Kept under iOS Safari's 16,777,216-pixel canvas limit. */
const CANVAS_SAFE_PIXELS = 16_000_000;

/** The size to draw a w×h photo at: within both caps, never enlarged. */
export function fitPhoto(w: number, h: number, maxEdge = PHOTO_MAX_EDGE, maxPixels = PHOTO_MAX_PIXELS): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 };
  const s = Math.min(1, maxEdge / Math.max(w, h), Math.sqrt(maxPixels / (w * h)));
  return { w: Math.max(1, Math.floor(w * s)), h: Math.max(1, Math.floor(h * s)) };
}

/**
 * "Whiteboard photo 2026-09-28 14.05.jpg" — no brackets or colons, so the
 * prompt that names it can be read back (sourceImage.imageNameInPrompt).
 */
export function photoName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `Whiteboard photo ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}.${p(now.getMinutes())}.jpg`;
}

export type ShrinkResult =
  | { ok: true; blob: Blob; width: number; height: number }
  | { ok: false; reason: "too_big" | "heic" | "unreadable" | "encode_failed" };

/** What to tell the person when a photo could not be used. */
export const SHRINK_FAILURE_MESSAGE: Record<Exclude<ShrinkResult, { ok: true }>["reason"], string> = {
  too_big: "That file is too large to use.",
  heic: "This photo is in HEIC format, which this browser can't open. Use “Take photo” instead, or set the camera to save JPEG.",
  unreadable: "That photo couldn't be opened — try taking it again.",
  encode_failed: "The photo couldn't be prepared on this phone — try again.",
};

/** Decode, shrink and re-encode a picked or captured photo. Browser only. */
export async function shrinkPhoto(file: File): Promise<ShrinkResult> {
  if (file.size > PHOTO_MAX_INPUT_BYTES) return { ok: false, reason: "too_big" };
  const url = URL.createObjectURL(file);
  const img = new Image();
  const canvases: HTMLCanvasElement[] = [];
  try {
    img.src = url;
    try {
      await img.decode();
    } catch {
      return { ok: false, reason: /hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name) ? "heic" : "unreadable" };
    }
    // naturalWidth/Height are the upright (EXIF-rotated) size in current browsers.
    const out = fitPhoto(img.naturalWidth, img.naturalHeight);
    let src: CanvasImageSource = img;
    let sw = img.naturalWidth, sh = img.naturalHeight;
    // Halve while still more than twice too big — one big bilinear step blurs
    // handwriting — but never make a canvas iOS cannot hold.
    while (sw / 2 >= out.w && (sw / 2) * (sh / 2) <= CANVAS_SAFE_PIXELS) {
      const c = document.createElement("canvas");
      canvases.push(c);
      c.width = Math.floor(sw / 2);
      c.height = Math.floor(sh / 2);
      const x = c.getContext("2d");
      if (!x) break;
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = "high";
      x.drawImage(src, 0, 0, c.width, c.height);
      src = c; sw = c.width; sh = c.height;
    }
    const c = document.createElement("canvas");
    canvases.push(c);
    c.width = out.w;
    c.height = out.h;
    const ctx = c.getContext("2d");
    if (!ctx) return { ok: false, reason: "encode_failed" };
    // A transparent PNG would turn black as a JPEG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.w, out.h);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, out.w, out.h);
    let blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", PHOTO_JPEG_QUALITY));
    // Belt and braces: under ~3.5 MB so it stays inside the model's 5 MB per image
    // once base64-encoded (generateJob.MAX_ENCODED_IMAGE_BYTES). Not expected at this size.
    if (blob && blob.size > PHOTO_MAX_OUTPUT_BYTES) blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.7));
    return blob ? { ok: true, blob, width: out.w, height: out.h } : { ok: false, reason: "encode_failed" };
  } finally {
    // Release the memory now — iOS gives a page little of it.
    for (const cv of canvases) { cv.width = 0; cv.height = 0; }
    img.src = "";
    URL.revokeObjectURL(url);
  }
}
