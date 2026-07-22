/**
 * Pure geometry for the Screencast Studio webcam inset (picture-in-picture).
 * Kept framework-free so the placement math is unit-testable without a canvas.
 */
export type InsetCorner = "br" | "bl" | "tr" | "tl";

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Where to draw the webcam inset inside a `frameW × frameH` output frame.
 * The inset is `scale` of the frame WIDTH (0..1), 16:9, inset from the edges by
 * `margin` px, pinned to the chosen corner. Clamped so it always stays fully
 * inside the frame.
 */
export function insetRect(
  frameW: number,
  frameH: number,
  corner: InsetCorner,
  scale: number,
  margin = 24,
): Rect {
  const s = Math.min(0.6, Math.max(0.08, scale));
  let w = Math.round(frameW * s);
  let h = Math.round((w * 9) / 16);
  // Never let the inset exceed the frame (tiny frames / big scale).
  w = Math.min(w, frameW - 2 * margin);
  h = Math.min(h, frameH - 2 * margin);
  const right = corner === "br" || corner === "tr";
  const bottom = corner === "br" || corner === "bl";
  const x = right ? frameW - w - margin : margin;
  const y = bottom ? frameH - h - margin : margin;
  return { x: Math.max(0, x), y: Math.max(0, y), w, h };
}

/**
 * Cover-fit source (camera) dimensions into a destination rect — returns the
 * source crop box so the camera fills the inset without distortion (like
 * background-size: cover). Used by the compositor's drawImage(src-crop → dest).
 */
export function coverCrop(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) return { x: 0, y: 0, w: srcW, h: srcH };
  const srcAR = srcW / srcH;
  const dstAR = dstW / dstH;
  if (srcAR > dstAR) {
    // source wider → crop the sides
    const w = srcH * dstAR;
    return { x: (srcW - w) / 2, y: 0, w, h: srcH };
  }
  // source taller → crop top/bottom
  const h = srcW / dstAR;
  return { x: 0, y: (srcH - h) / 2, w: srcW, h };
}
