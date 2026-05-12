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
export const PAD = 4;

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

/** Width consumed by the task-type marker icon on the FIRST line only.
 *  Mirrors the renderer: marker is drawn at (x+4, y+4) at 14×14 with a 2px
 *  gap to text → text on line 1 starts at x+20. Combined with the 4px right
 *  PAD, line 1 has `el.width - 24` of usable horizontal space, while
 *  lines 2+ get the full `el.width - 8`. */
export const TASK_MARKER_LINE1_RESERVE = 16; // 20 (marker left edge) − 4 (PAD)

/** Vertical "chrome" reserved by the renderer for icons/markers within a
 *  task or sub-process. Subtracted from element height to give usable
 *  vertical space for the label.
 *  - task no marker: 2*PAD = 8 (just top/bottom padding)
 *  - task with marker: 2*PAD = 8 — line 1 wraps AROUND the marker (text
 *    starts beside the marker, not below it), so the marker no longer
 *    reserves vertical space. The marker reserves horizontal space on
 *    line 1 only (see TASK_MARKER_LINE1_RESERVE).
 *  - subprocess (collapsed) with bottom marker: 4 PAD top + 20 reserve = 24 */
function verticalChrome(type: AutosizeType, _hasTaskMarker: boolean): number {
  if (type === "task") return 2 * PAD;
  // subprocess (collapsed): 4 PAD top + 20 marker reserve bottom
  return 24;
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
  const vChrome = verticalChrome(type, hasTaskMarker);
  const text = label || "";

  // Quick path: empty / very short label fits at s = 1.
  if (text.trim() === "") return { w: defaultW, h: defaultH };

  const MAX_S = 8;
  const STEP = 0.05;
  for (let s = 1.0; s <= MAX_S + 1e-6; s += STEP) {
    const innerW = defaultW * s - 2 * PAD;
    const innerH = defaultH * s - vChrome;
    if (innerW <= 0 || innerH <= 0) continue;
    const firstLineW = hasTaskMarker ? innerW - TASK_MARKER_LINE1_RESERVE : undefined;
    if (firstLineW != null && firstLineW <= 0) continue;
    const lines = wrapText(text, innerW, fontSize, firstLineW);
    const needsH = lines.length * LINE_HEIGHT;
    // Longest wrapped line's pixel width (chars × avgCharWidth). Line 0
    // is checked against firstLineW; lines 1+ against innerW.
    let widthOK = true;
    for (let i = 0; i < lines.length; i++) {
      const lw = lines[i].length * fontSize * AVG_CHAR_W_FACTOR;
      const cap = (i === 0 && firstLineW != null) ? firstLineW : innerW;
      if (lw > cap) { widthOK = false; break; }
    }
    if (widthOK && needsH <= innerH) {
      return { w: Math.round(defaultW * s), h: Math.round(defaultH * s) };
    }
  }
  return { w: Math.round(defaultW * MAX_S), h: Math.round(defaultH * MAX_S) };
}
