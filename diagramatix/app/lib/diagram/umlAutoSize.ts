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
