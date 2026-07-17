/**
 * Shared text-metric constants and helpers so the renderer's word-wrap and
 * the reducer's autosize calculation never drift apart.
 *
 * Constants mirror exactly the values inlined in SymbolRenderer.tsx's
 * interior-label code (PAD=4, lineH=14, avgCharWidth = fontSize * 0.55).
 * If those constants change in the renderer, change them here too.
 */

export const AVG_CHAR_W_FACTOR = 0.55;
export const LINE_HEIGHT = 14;
/** 5px gap between the element boundary and the text-box boundary on every
 *  side. Used by both autosize and the renderer so the two never disagree. */
export const PAD = 5;
/** Task marker icon geometry (mirrors SymbolRenderer's BpmnTaskMarker). The
 *  marker is drawn at offset (4, 4) from the element's top-left at 14×14. */
export const TASK_MARKER_X = 4;
export const TASK_MARKER_Y = 4;
export const MARKER_SIZE = 14;
/** Subprocess collapsed marker: bottom-centre, 14×14, with a 3px offset
 *  from the element bottom (top edge at height-17, bottom at height-3). */
export const SUBPROCESS_MARKER_BOTTOM_OFFSET = 3;
/** Bottom reserve consumed by the subprocess marker (always, since the
 *  marker is permanent on a collapsed sub-process). Includes the marker
 *  itself plus a 2px gap above it. */
export const SUBPROCESS_BOTTOM_RESERVE =
  SUBPROCESS_MARKER_BOTTOM_OFFSET + MARKER_SIZE + 2; // 19

/**
 * Insert HARD line breaks into a generated Task / Subprocess name so multi-word
 * names read as several lines instead of one long line (Paul 2026-07-12). Word
 * count decides the break points:
 *   • ≤ 2 words         → unchanged
 *   • 3 or 4 words      → break after the 2nd word
 *   • 5 or 6 words      → break after the 3rd word
 *   • more than 6 words → break after every 3rd word
 * Idempotent: `\n` counts as whitespace when splitting, so re-running produces
 * the same result (the normaliser can run more than once).
 */
export function hardWrapProcessName(name: string): string {
  if (!name) return name;
  const words = name.trim().split(/\s+/).filter(Boolean);
  const n = words.length;
  if (n <= 2) return name;
  if (n <= 4) return words.slice(0, 2).join(" ") + "\n" + words.slice(2).join(" ");
  if (n <= 6) return words.slice(0, 3).join(" ") + "\n" + words.slice(3).join(" ");
  const lines: string[] = [];
  for (let i = 0; i < n; i += 3) lines.push(words.slice(i, i + 3).join(" "));
  return lines.join("\n");
}

/** Word-wrap a label to fit a given pixel width, using a fixed-pitch
 *  character-width estimate (avgCharWidth = fontSize * AVG_CHAR_W_FACTOR).
 *  Splits on '\n' first so explicit Shift+Enter breaks are preserved.
 *  Returns an array of wrapped lines (always ≥ 1, empty string if input empty).
 *
 *  `firstLineWidth` (optional): if provided, line 1 is wrapped at this
 *  narrower width while lines 2+ use `maxWidth`. Used for task-with-marker
 *  geometry where the first line wraps around the marker icon. */
export function wrapText(
  text: string,
  maxWidth: number,
  fontSize = 12,
  firstLineWidth?: number,
): string[] {
  const avgCharWidth = fontSize * AVG_CHAR_W_FACTOR;
  const fullCpl = Math.max(1, Math.floor(maxWidth / avgCharWidth));
  const firstCpl = firstLineWidth != null
    ? Math.max(1, Math.floor(firstLineWidth / avgCharWidth))
    : fullCpl;
  const lines: string[] = [];
  for (const segment of text.split("\n")) {
    const words = segment.split(" ");
    let current = "";
    for (const word of words) {
      // Choose the line budget for the line we'd be COMMITTING to (the
      // current accumulating one). lines.length === 0 && current === ""
      // means we haven't pushed any line yet → still building line 1.
      const cpl = lines.length === 0 ? firstCpl : fullCpl;
      if (!current) { current = word; }
      else if (current.length + 1 + word.length <= cpl) { current += " " + word; }
      else { lines.push(current); current = word; }
    }
    lines.push(current);
  }
  return lines.length ? lines : [""];
}

/** Default sizes for the two types that get text-driven autosize.
 *  These mirror app/lib/diagram/symbols/definitions.ts and serve as both
 *  the floor (s = 1) and the aspect-ratio source for autosize. */
const TASK_DEFAULT_W = 102;
const TASK_DEFAULT_H = 65;
const SUBPROCESS_DEFAULT_W = 108;
const SUBPROCESS_DEFAULT_H = 72;

export type AutosizeType = "task" | "subprocess";

export function getDefaultSize(type: AutosizeType): { w: number; h: number } {
  return type === "task"
    ? { w: TASK_DEFAULT_W, h: TASK_DEFAULT_H }
    : { w: SUBPROCESS_DEFAULT_W, h: SUBPROCESS_DEFAULT_H };
}

/** Small visual breathing space between the marker icon's right edge and
 *  the first character of text on line 1 (when narrowing kicks in).
 *  Tightened from 2 → 3 px per user request — slightly more separation
 *  so the marker and the first character don't visually touch at small
 *  task widths. */
export const TASK_MARKER_LINE1_GAP = 3;

/** Horizontal width reserved on the FIRST line of a task with a marker
 *  (only when the text block grows tall enough to vertically intersect the
 *  marker — for 1- and 2-line labels at default size, no reserve applies).
 *
 *  Reserved area on the left of line 1 (relative to PAD-aligned text-box
 *  left): marker_x (4) + marker_w (14) + gap (3) − PAD (5) = 16. So
 *  firstLineWidth = innerW − 16, and text on line 1 starts at x + 21. */
export const TASK_MARKER_LINE1_RESERVE = TASK_MARKER_X + MARKER_SIZE + TASK_MARKER_LINE1_GAP - PAD;

/** Vertical "chrome" reserved by the renderer for icons/markers within a
 *  task or sub-process. Subtracted from element height to give usable
 *  vertical space for the label.
 *  - task: 2*PAD = 10 (just top/bottom padding). Even when a marker is
 *    present, the marker doesn't reserve vertical space — line 1 wraps
 *    around it horizontally when the text block grows tall enough to
 *    intersect the marker's vertical band.
 *  - subprocess (collapsed): PAD top + SUBPROCESS_BOTTOM_RESERVE bottom
 *    = 5 + 19 = 24. The bottom marker is permanent, so text can never
 *    extend into the bottom reserve. */
function verticalChrome(type: AutosizeType): number {
  if (type === "task") return 2 * PAD;
  return PAD + SUBPROCESS_BOTTOM_RESERVE;
}

/** Compute the smallest aspect-locked size (scale factor s ≥ 1 of the type's
 *  default) such that the label wraps within the inner width and the wrapped
 *  line count fits in the inner height.
 *
 *  Iterates s in 0.1 steps from 1.0 to 8.0 (so ≤ 71 wrap evaluations — trivial
 *  cost per keystroke). Returns the rounded integer pixel dimensions. */
export function autoSizeForType(
  type: AutosizeType,
  label: string,
  fontSize = 12,
  hasTaskMarker = false,
): { w: number; h: number } {
  const { w: defaultW, h: defaultH } = getDefaultSize(type);
  const vChrome = verticalChrome(type);
  const text = label || "";

  // Quick path: empty / very short label fits at s = 1.
  if (text.trim() === "") return { w: defaultW, h: defaultH };

  const MAX_S = 8;
  const STEP = 0.05;
  for (let s = 1.0; s <= MAX_S + 1e-6; s += STEP) {
    const H = defaultH * s;
    const innerW = defaultW * s - 2 * PAD;
    const innerH = H - vChrome;
    if (innerW <= 0 || innerH <= 0) continue;

    // First pass: try with line 1 at full inner width. Only narrow line 1
    // if the centred text block extends up into the marker zone — i.e.
    // line 1's top y crosses the marker's bottom edge (PAD + MARKER_SIZE
    // − ... using element-local coords: textBlockTop_local < TASK_MARKER_Y
    // + MARKER_SIZE = 18). This matches the renderer.
    let firstLineW: number | undefined = undefined;
    let lines = wrapText(text, innerW, fontSize, firstLineW);
    let textBlockH = lines.length * LINE_HEIGHT;

    if (hasTaskMarker) {
      // Text block is centred vertically inside the element.
      const textBlockTopLocal = (H - textBlockH) / 2;
      const markerBottomLocal = TASK_MARKER_Y + MARKER_SIZE; // 18
      if (textBlockTopLocal < markerBottomLocal) {
        // Marker would overlap line 1 → narrow line 1.
        firstLineW = innerW - TASK_MARKER_LINE1_RESERVE;
        if (firstLineW <= 0) continue;
        lines = wrapText(text, innerW, fontSize, firstLineW);
        textBlockH = lines.length * LINE_HEIGHT;
      }
    }

    // Check fit: every line within its width cap; total height ≤ innerH.
    let widthOK = true;
    for (let i = 0; i < lines.length; i++) {
      const lw = lines[i].length * fontSize * AVG_CHAR_W_FACTOR;
      const cap = (i === 0 && firstLineW != null) ? firstLineW : innerW;
      if (lw > cap) { widthOK = false; break; }
    }
    if (widthOK && textBlockH <= innerH) {
      return { w: Math.round(defaultW * s), h: Math.round(H) };
    }
  }
  return { w: Math.round(defaultW * MAX_S), h: Math.round(defaultH * MAX_S) };
}

/**
 * Tab (header) geometry of a uml-package folder shape. The SINGLE source of
 * truth shared by UmlPackageShape (SymbolRenderer) and the connector router
 * (snapToPackageSilhouette) so a connection on the top boundary always meets the
 * drawn tab — and doesn't drift as the package NAME (hence tab width) changes.
 * Keep in lock-step with UmlPackageShape.
 */
export function computePackageTab(
  el: { label?: string; width: number; height: number },
  fontScale = 1,
): { tabW: number; tabH: number } {
  const labelFontSize = Math.round(12 * fontScale * 10) / 10;
  const lineH = Math.round(labelFontSize * 1.3);
  const PADX = 8, PADY = 5;
  const maxTabW = el.width * 0.8;
  const lines = wrapText(el.label || "", Math.max(20, maxTabW - PADX * 2), labelFontSize);
  const longest = Math.max(1, ...lines.map(l => l.length));
  const tabW = Math.min(Math.max(60, longest * labelFontSize * 0.6 + PADX * 2), maxTabW);
  const tabH = Math.min(Math.max(24, lines.length * lineH + PADY * 2), el.height - 12);
  return { tabW, tabH };
}
