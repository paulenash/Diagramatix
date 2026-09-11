/**
 * WRAP FIRST, GROW SECOND — one rule, for every shape that holds its name.
 *
 * A name wraps inside the shape's own width; if the wrapped block does not fit
 * the interior, the shape grows DOWNWARD. Width never changes.
 *
 * **Why width is fixed.** For EPC, the layout reserves an assignment gutter
 * either side of the spine, so a wider box would shove every branch's
 * satellites out of column. For flowcharts, ranks are laid out side by side and
 * a wider box pushes its neighbours apart. In both cases growing sideways moves
 * things that have nothing to do with the name someone typed.
 *
 * **Why one module.** The EPC version of this shipped first, and the flowchart
 * shapes needed exactly the same thing — a second copy would have been two
 * implementations of one idea, and the interesting half (what fraction of a
 * parallelogram is actually usable for text) would have been written twice with
 * different numbers.
 *
 * The renderer and the layout MUST measure identically. If they disagree, a box
 * grown for three lines renders four and the text hangs out of the shape it was
 * grown to fit — which is the bug this replaced.
 */
import type { SymbolType } from "./types";
import { getSymbolDefinition } from "./symbols/definitions";
import { LINE_HEIGHT, PAD, wrapText } from "./textMetrics";

/**
 * How much of a shape is NOT usable for its name.
 *
 * `insetPx` + `insetFrac` × width is taken off the WIDTH — sloping and curved
 * edges mean a bounding box is not the text box. `chromeY` is taken off the
 * HEIGHT: a wavy document base, a cylinder's ellipses, a drill-down marker.
 */
interface ShapeChrome {
  insetPx?: number;
  insetFrac?: number;
  chromeY?: number;
}

const CHROME: Record<string, ShapeChrome> = {
  // ── EPC ───────────────────────────────────────────────────────────────
  // A hexagon's flat top and bottom are narrower than its widest point; a
  // chevron loses width at the point AND the notch. chromeY is tuned so the
  // default box holds exactly two lines before it grows — one for the Process
  // Interface, whose bottom belongs to its drill-down marker.
  "epc-event": { insetPx: 44, chromeY: 8 },
  "epc-function": { insetPx: 16, chromeY: 22 },
  "epc-interface": { insetPx: 40, chromeY: 20 },
  "epc-org-unit": { insetPx: 30, chromeY: 8 },   // the half-ellipse cap
  "epc-position": { insetPx: 30, chromeY: 8 },
  "epc-data": { insetPx: 22, chromeY: 8 },        // the left bar
  "epc-application": { insetPx: 30, chromeY: 8 }, // bars both sides

  // ── Standard Flowchart ────────────────────────────────────────────────
  "flowchart-process": { insetPx: 16 },
  "flowchart-predefined": { insetPx: 26 },          // the double bars
  "flowchart-terminator": { insetPx: 26 },          // stadium ends
  "flowchart-io": { insetFrac: 0.40 },              // parallelogram taper
  "flowchart-manual-op": { insetFrac: 0.30 },       // inverted trapezoid
  "flowchart-preparation": { insetFrac: 0.30 },     // hexagon points
  "flowchart-display": { insetFrac: 0.22 },         // curved left/right
  "flowchart-delay": { insetFrac: 0.20 },           // D-shape
  "flowchart-document": { insetPx: 16, chromeY: 14 },     // wavy base
  "flowchart-multidoc": { insetPx: 22, chromeY: 20 },     // stacked + wavy base
  "flowchart-manual-input": { insetPx: 16, chromeY: 10 }, // sloped top
  "flowchart-database": { insetPx: 12, chromeY: 24 },     // cylinder ellipses
  "flowchart-offpage": { insetPx: 12, chromeY: 14 },      // pentagon point
  "flowchart-onpage": { insetPx: 8 },
  "flowchart-comment": { insetPx: 16 },
};

/** Types that render their name somewhere other than inside the box, or not at all. */
const NO_INTERNAL_LABEL = new Set<string>([
  // EPC connectors carry their label UNDER the circle.
  "epc-xor", "epc-and", "epc-or",
  // A decision draws and wraps its own text (FlowchartDecisionShape); a
  // parallel bar and a swimlane have no name in the box.
  "flowchart-decision", "flowchart-parallel", "flowchart-vswimlane",
  // A merge triangle's label is nudged out of its narrow point.
  "flowchart-merge",
]);

export function holdsInternalLabel(type: string): boolean {
  return !NO_INTERNAL_LABEL.has(type);
}

/** Usable text width inside a shape of this type at this width. */
export function textWidthFor(type: string, width: number): number {
  const c = CHROME[type] ?? { insetPx: 16 };
  const inset = (c.insetPx ?? 0) + width * (c.insetFrac ?? 0);
  return Math.max(24, width - inset);
}

/** Vertical space a shape spends on something other than its name. */
function chromeHeight(type: string): number {
  return CHROME[type]?.chromeY ?? 0;
}

/**
 * The name as it will be DRAWN, wrapped to the shape's usable width.
 *
 * The renderer calls this; the sizing below calls it too, which is what keeps
 * the two from disagreeing.
 */
export function wrapShapeLabel(type: string, label: string, width: number): string[] {
  return wrapText(label ?? "", textWidthFor(type, width), 12);
}

/**
 * Size a shape to its name: same width, taller when the wrapped block does not
 * fit the interior.
 */
export function fitShapeToLabel(type: string, label: string): { w: number; h: number } {
  const def = getSymbolDefinition(type as SymbolType);
  const w = def.defaultWidth;
  if (!holdsInternalLabel(type)) return { w, h: def.defaultHeight };

  const lines = wrapShapeLabel(type, label, w);
  const needed = PAD * 2 + chromeHeight(type) + lines.length * LINE_HEIGHT;
  return { w, h: Math.max(def.defaultHeight, needed) };
}

/**
 * How many lines the shape holds at its DEFAULT height before it has to grow.
 * Exported because it is the clearest way to state the rule in a test.
 */
export function freeLinesFor(type: string): number {
  const def = getSymbolDefinition(type as SymbolType);
  const interior = def.defaultHeight - PAD * 2 - chromeHeight(type);
  return Math.max(1, Math.floor(interior / LINE_HEIGHT));
}
