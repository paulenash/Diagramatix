/**
 * A diagram → a self-contained SVG that LibreOffice can turn into a PDF.
 *
 * `renderTemplateThumbnailSvg` already does the drawing and already runs
 * server-side — it is what produces template thumbnails from Node routes and
 * scripts. This wrapper fixes the three things that are fine for an inline
 * thumbnail and not fine for a file:
 *
 *  1. **An intrinsic size.** The renderer emits a `viewBox` and nothing else.
 *     Given no width or height LibreOffice picks a default page and the diagram
 *     lands tiny or clipped. `thumbnailTransform` already computes exactly the
 *     numbers to use, and letting the SVG's own size drive the page also gives a
 *     one-page PDF at the diagram's real (wide) aspect, which beats forcing A4.
 *  2. **An opaque background.** A transparent SVG becomes a transparent PDF,
 *     which prints as whatever the reader's viewer decides.
 *  3. **A font stack that exists.** The image carries Liberation and Noto; a
 *     bare `sans-serif` resolves to whatever LibreOffice guesses.
 *
 * FIDELITY, honestly: this is the simplified renderer, not the desktop canvas.
 * Shapes, pools, lanes, labels, connectors and colours are right; event and task
 * markers are approximated. If a partner puts the PDF in a client-facing report
 * they should know that — which is why `diagram.bpmn` ships alongside it.
 */
import type { DiagramData } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import { renderTemplateThumbnailSvg, thumbnailFrameFor, THUMBNAIL_PAD } from "@/app/lib/diagram/templateThumbnail";
import { healOnLoad } from "@/app/lib/diagram/healOnLoad";

/** Matches the fonts installed in the Docker runner stage. */
const FONT_STACK = "Liberation Sans, Noto Sans, DejaVu Sans, Arial, sans-serif";

export class NothingToRenderError extends Error {
  constructor() { super("That diagram has no elements to render."); this.name = "NothingToRenderError"; }
}

/** `colorConfig`: the colours the editor paints with (the project's scheme — effectiveSymbolColors); type defaults when absent. */
export function renderDiagramSvg(stored: DiagramData, colorConfig?: SymbolColorConfig): string {
  // As the editor opens it (healOnLoad): a multi-line pool name gets the header
  // width it needs, and a message label that was never placed is placed.
  const data = healOnLoad(stored);
  const els = data.elements ?? [];
  if (els.length === 0) throw new NothingToRenderError();

  const OPTS = { trueColors: true, fullLabels: true, ...(colorConfig ? { colorConfig } : {}) } as const;
  const body = renderTemplateThumbnailSvg(data, OPTS);
  // The renderer returns "" for an empty diagram; never hand that to soffice.
  if (!body.trim()) throw new NothingToRenderError();

  // The page is the picture's own frame (routes and labels included).
  const { w, h } = thumbnailFrameFor(data, OPTS);
  const width = Math.max(1, Math.round(w));
  const height = Math.max(1, Math.round(h));

  // Inject the size onto the opening tag the renderer produced, and slip a
  // white backdrop in behind everything it drew.
  const backdrop = `<rect x="${-THUMBNAIL_PAD}" y="${-THUMBNAIL_PAD}" width="${width + THUMBNAIL_PAD * 2}" height="${height + THUMBNAIL_PAD * 2}" fill="#ffffff"/>`;

  return body.replace(
    /^<svg([^>]*)>/,
    (_m, attrs: string) =>
      `<svg${attrs} width="${width}" height="${height}" style="font-family:${FONT_STACK}">${backdrop}`,
  );
}
