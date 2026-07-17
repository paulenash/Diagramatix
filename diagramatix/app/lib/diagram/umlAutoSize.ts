/**
 * Content-based sizing for UML class / enumeration boxes.
 *
 * Extracted from useDiagram so both the interactive editor AND the
 * image-import layout (`layoutDomainPreserved`) size boxes the same way:
 * WIDTH from the longest text line, HEIGHT from header + attribute/operation
 * (or enum-value) row count. The AI's fractional image `bounds` come back
 * near-uniform, so trusting them makes every class the same shape; sizing to
 * content reproduces the original diagram's proportions far more faithfully.
 *
 * Constants match the renderer at `SymbolRenderer.tsx` (BASE_HEADER_H=28,
 * PAD=4, CHAR_W=6.5, LINE_H=14) so autosize and render agree on text layout.
 */
import type { DiagramElement } from "./types";

/**
 * Auto-resize a uml-enumeration or uml-class element to fit its label and content.
 *
 * `nameSidePad` (default 0) guarantees at least that many px of clear space on
 * EACH side of the name text — the image-import layout passes 50 so reproduced
 * boxes keep breathing room around the title (the editor keeps its tight
 * default). It only widens; it never shrinks below the content width.
 *
 * `fontScale` (default 1 = 12px baseline) MUST match the canvas FontScaleCtx —
 * `(data.fontSize ?? 14) / 12` for domain diagrams — so the box grows with the
 * font. The per-character width and line height scale with it; the fixed
 * header/padding do not (they mirror the renderer's HEADER_H / PAD constants).
 */
export function autoResizeUmlElement(el: DiagramElement, nameSidePad = 0, fontScale = 1): DiagramElement {
  const BASE_HEADER_H = 28;
  const PAD = 4;
  const CHAR_W = 6.5 * fontScale;   // per-char width scales with the font (renderer 12px→14px)
  const LINE_H = Math.round(14 * fontScale); // matches renderer lineH = round(14 * fsc)
  const MIN_W = 80;
  const MIN_H = 40;

  const stereotype = (el.properties.stereotype as string | undefined)
    ?? (el.type === "uml-class" ? "entity" : "enumeration");
  const showStereotype = el.type === "uml-enumeration"
    || ((el.properties.showStereotype as boolean | undefined) ?? false);
  const stereotypeW = showStereotype ? (`«${stereotype}»`.length * CHAR_W * 0.8) : 0;
  const stereotypeH = showStereotype ? Math.round(9 * fontScale) + 2 : 0; // stereotype font (~9*fsc) + 2px gap

  const labelLines = el.label.split("\n");
  const labelMaxW = Math.max(...labelLines.map(l => l.length * CHAR_W));
  const extraLabelLines = Math.max(0, labelLines.length - 1);
  const headerH = BASE_HEADER_H + extraLabelLines * LINE_H + stereotypeH;

  if (el.type === "uml-enumeration") {
    const values: string[] = (el.properties.values as string[] | undefined) ?? [];
    const valuesMaxW = values.length > 0 ? Math.max(...values.map(v => v.length * CHAR_W)) : 0;
    const contentW = Math.max(stereotypeW, labelMaxW, valuesMaxW) + PAD * 2;
    const newWidth = Math.max(MIN_W, contentW, labelMaxW + nameSidePad * 2);
    const ENUM_BOTTOM_PAD = -2; // tighter bottom on enumeration values
    const valuesH = values.length * LINE_H;
    const newHeight = Math.max(MIN_H, headerH + valuesH + (values.length > 0 ? ENUM_BOTTOM_PAD : 0));
    if (newWidth === el.width && newHeight === el.height) return el;
    return { ...el, width: newWidth, height: newHeight };
  }

  // uml-class — with attributes and operations compartments
  const attributes = (el.properties.attributes as { name: string; visibility?: string; type?: string; multiplicity?: string; defaultValue?: string; propertyString?: string; isDerived?: boolean }[] | undefined) ?? [];
  const operations = (el.properties.operations as { name: string; visibility?: string }[] | undefined) ?? [];
  const showAttrs = (el.properties.showAttributes as boolean | undefined) ?? false;
  const showOps = (el.properties.showOperations as boolean | undefined) ?? false;

  // Compute max width from all content
  let maxContentW = Math.max(stereotypeW, labelMaxW);
  if (showAttrs) {
    for (const attr of attributes) {
      let s = "";
      if (attr.visibility) s += attr.visibility + " ";
      if (attr.isDerived) s += "/";
      s += attr.name;
      if (attr.type) s += " : " + attr.type;
      if (attr.multiplicity) s += " [" + attr.multiplicity + "]";
      if (attr.defaultValue) s += " = " + attr.defaultValue;
      if (attr.propertyString) s += " " + attr.propertyString;
      maxContentW = Math.max(maxContentW, s.length * CHAR_W);
    }
  }
  if (showOps) {
    for (const op of operations) {
      let s = "";
      if (op.visibility) s += op.visibility + " ";
      s += op.name + "()";
      maxContentW = Math.max(maxContentW, s.length * CHAR_W);
    }
  }

  const contentW = maxContentW + PAD * 2;
  const newWidth = Math.max(MIN_W, contentW, labelMaxW + nameSidePad * 2);
  const BOTTOM_PAD = 10;
  const SECTION_PAD = 5;
  const attrsH = showAttrs ? attributes.length * LINE_H + (attributes.length > 0 && showOps ? SECTION_PAD : 0) : 0;
  const opsH = showOps ? operations.length * LINE_H : 0;
  const hasContent = (showAttrs && attributes.length > 0) || (showOps && operations.length > 0);
  const bodyH = Math.max(LINE_H, attrsH + opsH + (hasContent ? BOTTOM_PAD : 0));
  const newHeight = Math.max(MIN_H, headerH + bodyH);
  if (newWidth === el.width && newHeight === el.height) return el;
  return { ...el, width: newWidth, height: newHeight };
}

/** Approximate width of one glyph as a fraction of the font size, calibrated to
 *  a sans-serif (the canvas font). Good enough to predict browser line-wrapping. */
function charEm(ch: string): number {
  if (ch === " ") return 0.28;
  if ("iljI|.,:;'!".includes(ch)) return 0.26;
  if ("ftr()[]{}/\\-".includes(ch)) return 0.34;
  if (ch === "m" || ch === "M" || ch === "W") return 0.85;
  if (ch === "w") return 0.72;
  if (ch >= "A" && ch <= "Z") return 0.68;
  if (ch >= "0" && ch <= "9") return 0.56;
  return 0.53; // default lowercase
}
function textWidthPx(s: string, fontSize: number): number {
  let w = 0;
  for (const ch of s) w += charEm(ch) * fontSize;
  return w;
}

/** Word-wrap by PIXEL width (matching the browser), returning the line array. */
export function wrapByWidth(text: string, maxWidthPx: number, fontSize: number): string[] {
  const words = (text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  const spaceW = charEm(" ") * fontSize;
  let cur = "", curW = 0;
  for (let word of words) {
    // A single word wider than the line breaks mid-word.
    while (textWidthPx(word, fontSize) > maxWidthPx && word.length > 1) {
      let i = word.length;
      while (i > 1 && textWidthPx(word.slice(0, i), fontSize) > maxWidthPx) i--;
      if (cur) { lines.push(cur); cur = ""; curW = 0; }
      lines.push(word.slice(0, i));
      word = word.slice(i);
    }
    const wW = textWidthPx(word, fontSize);
    if (!cur) { cur = word; curW = wW; }
    else if (curW + spaceW + wW <= maxWidthPx) { cur += " " + word; curW += spaceW + wW; }
    else { lines.push(cur); cur = word; curW = wW; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/**
 * Size a uml-note's box to JUST contain its wrapped text — matching the renderer
 * (`UmlNoteShape`): a foreignObject at (x+5, y+4, w-10, h-8) whose div has
 * padding 3px 5px and fontSize 12·fontScale, lineHeight 1.3. So the usable text
 * width is w-20 and the height needed is 14 + lines·(12·fontScale·1.3), where the
 * line count comes from PIXEL-accurate wrapping (a flat char budget over-counts).
 *
 * `fontScale` MUST match the canvas FontScaleCtx ((data.fontSize ?? 14)/12 for
 * domain) so the box fits the rendered 14px text, not 12px. When `width` is
 * given (an existing note) the width is kept and only the height re-fits; when
 * omitted (fresh/generated note) a comfortably-wide width is chosen from the text.
 */
export function sizeUmlNote(label: string, opts?: { width?: number; fontScale?: number }): { width: number; height: number } {
  const fontScale = opts?.fontScale ?? 1;
  const FS = 12 * fontScale;
  const lineH = 1.3 * FS;
  const clean = (label ?? "").replace(/\s+/g, " ").trim();
  const totalPx = textWidthPx(clean, FS);
  let width: number;
  if (opts?.width && opts.width > 40) {
    width = opts.width;
  } else {
    // Fresh note: a comfortably WIDE sticky. Aim for ~sqrt lines, so the width is
    // the total text width divided across that many lines (+20 for the box chrome).
    const len = Math.max(1, clean.length);
    const targetLines = Math.max(2, Math.min(6, Math.round(Math.sqrt(len / 6))));
    width = Math.max(120, Math.min(280, Math.round(totalPx / targetLines + 20)));
  }
  const lines = wrapByWidth(clean, width - 20, FS);
  const height = Math.ceil(14 + lines.length * lineH);
  return { width: Math.round(width), height };
}
