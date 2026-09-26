/**
 * A picture of the canvas as it is right now.
 *
 * Lifted out of `SopGenerateDialog.tsx` (2026-09-24) so the Voice Assist debug
 * log could take a picture beside a command without a second implementation of
 * the same thing. The debug log no longer takes pictures at all — Paul,
 * 2026-09-26: "Make the snapshots in Voice Assist JSON, not SVG" — so its
 * whole-canvas capture went with them, and what is left is what the SOP figure
 * uses: one way to rasterise the canvas and one place to fix it.
 *
 * WHY NOT `html-to-image`. It is a dependency and it is the obvious reach. The
 * comment it replaced, written after the failure, says why not: `toPng` on a
 * bare `<svg>` "fails silently and left SOPs with no figure". The route below —
 * serialise the SVG, load it through an `<img>`, draw it into a `<canvas>` — is
 * reliable for this canvas because every style on it is inline.
 *
 * TWO THINGS A PICTURE DOES NOT CONTAIN, both by design and both worth knowing
 * before someone reports them as bugs:
 *
 *   • **Rich-text labels.** They are rendered in `<foreignObject>` (HTML). An
 *     SVG loaded as an `<img>` cannot rasterise HTML, and the embedded markup
 *     usually makes the SVG invalid XML, so keeping them fails the whole
 *     capture rather than one label. They are stripped. This has always been
 *     true of every SOP figure the product has shipped.
 *   • **Selection chrome.** Resize handles and the dashed blue outline are
 *     removed, so the picture shows the diagram rather than the editor.
 *
 * The maths is pure and tested; only `stripSelectionChrome` and `svgToPng`
 * touch the DOM.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** The minimum a snapshot needs in order to frame the content. */
export interface SnapshotBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ContentBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rectangle that holds everything, plus breathing room.
 *
 * Zero-size elements are ignored — a connector label or a placeholder with no
 * width would otherwise drag the frame off to the origin and shrink the diagram
 * to a corner. An empty diagram has no bounds at all, and says so with `null`
 * rather than returning a degenerate rectangle that later divides by zero.
 */
export function contentBounds(
  elements: readonly SnapshotBox[],
  margin = 30,
): ContentBounds | null {
  const els = elements.filter((e) => e.width > 0 && e.height > 0);
  if (els.length === 0) return null;
  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + e.width));
  const maxY = Math.max(...els.map((e) => e.y + e.height));
  return {
    x: minX - margin,
    y: minY - margin,
    w: (maxX - minX) + 2 * margin,
    h: (maxY - minY) + 2 * margin,
  };
}

/** Output pixel size for a bounds rectangle: clamped width, aspect preserved. */
export function fitOutputSize(
  bounds: ContentBounds,
  maxW = 1400,
  minW = 320,
): { outW: number; outH: number } {
  const outW = Math.min(maxW, Math.max(minW, Math.round(bounds.w)));
  // Aspect from the ORIGINAL bounds, not the clamped width, or a very wide
  // diagram clamped to maxW would come back squashed.
  const outH = Math.max(1, Math.round(bounds.h * (outW / bounds.w)));
  return { outW, outH };
}

/** Strip the editor's selection chrome from a cloned canvas SVG. */
export function stripSelectionChrome(clone: SVGSVGElement): void {
  clone.querySelectorAll("[data-resize-handle]").forEach((n) => n.remove());
  clone.querySelectorAll("rect").forEach((r) => {
    const s = r.getAttribute("stroke");
    if ((s === "#2563eb" || s === "#3b82f6") && r.getAttribute("stroke-dasharray")) r.setAttribute("stroke", "none");
  });
}

/**
 * Serialise a (viewBox'd) SVG clone to a PNG data URI via an offscreen `<img>`
 * and `<canvas>`, at 2× for a legible picture on a high-DPI screen.
 */
export async function svgToPng(
  clone: SVGSVGElement,
  outW: number,
  outH: number,
  scale = 2,
): Promise<string | undefined> {
  try {
    clone.setAttribute("xmlns", SVG_NS);
    const xml = new XMLSerializer().serializeToString(clone);
    const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    const img = new Image();
    await new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error("svg load"));
      img.src = src;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(outW * scale));
    canvas.height = Math.max(1, Math.round(outH * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    // White, not transparent: a PNG pasted into a Word document or an email
    // should not show whatever is behind it.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}
