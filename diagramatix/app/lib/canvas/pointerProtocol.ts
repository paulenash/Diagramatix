/**
 * What the mouse does, and what the cursor promises while it does it.
 *
 * The reference card behind "Canvas Help" in the status bar. Kept in code
 * beside the behaviour it describes — and in DATA rather than JSX — for the
 * same reason `commandCatalog.ts` is: a card that describes a gesture the
 * canvas no longer performs is worse than no card, and a test can only check
 * a list.
 *
 * Paul asked for this on 22 September 2026, alongside the written protocol in
 * `docs/clicking-and-selecting protocol summary.md`. That document is the
 * specification, including the parts still under review; THIS is a description
 * of what ships today, so the two are deliberately not the same text.
 *
 * CURSOR NAMES are the CSS values, because that is what can be verified. The
 * glyph beside each is only a reminder of its shape.
 */

/** The CSS cursor values the canvas actually uses. */
export type CursorName =
  | "grab" | "grabbing" | "pointer" | "crosshair" | "default" | "move"
  | "ew-resize" | "ns-resize" | "nesw-resize" | "nwse-resize";

/** A reminder of the shape, for a card that cannot show a real cursor. */
export const CURSOR_GLYPH: Record<CursorName, string> = {
  grab: "✋",
  grabbing: "✊",
  pointer: "👆",
  crosshair: "✛",
  default: "↖",
  move: "✥",
  "ew-resize": "↔",
  "ns-resize": "↕",
  "nesw-resize": "⤢",
  "nwse-resize": "⤡",
};

export interface HoverRow {
  /** What the pointer is over. */
  over: string;
  cursor: CursorName;
  /** Why it is that cursor, in a few words. Omitted when it is obvious. */
  note?: string;
}

export interface GestureRow {
  /** The gesture, in the order it happens. */
  does: string;
  /** What results. */
  result: string;
  note?: string;
}

export interface ProtocolSection {
  heading: string;
  hover?: HoverRow[];
  gestures?: GestureRow[];
}

export const POINTER_PROTOCOL: ProtocolSection[] = [
  {
    heading: "What the cursor is telling you",
    hover: [
      { over: "An element", cursor: "grab", note: "closes to ✊ while you hold it" },
      { over: "A selected element", cursor: "crosshair", note: "a connector can start here" },
      { over: "A pool header strip", cursor: "grab", note: "the handle you move a pool by" },
      { over: "A white-box pool body", cursor: "default", note: "clicks pass through to what is inside" },
      { over: "A connector", cursor: "pointer" },
      { over: "A message flow", cursor: "ew-resize", note: "its spine slides sideways" },
      { over: "A connector endpoint, waypoint or label", cursor: "grab" },
      { over: "A pool edge, lane or sub-lane divider", cursor: "ns-resize", note: "↔ on a left or right edge" },
      { over: "A boundary event", cursor: "default", note: "it is pinned to its host's edge" },
      { over: "Empty canvas", cursor: "grab", note: "dragging pans the diagram" },
    ],
  },
  {
    heading: "Selecting",
    gestures: [
      { does: "Click an element", result: "Selects it" },
      { does: "Click empty canvas, or press Esc", result: "Clears the selection", note: "Esc also cancels a connector drag, a label edit and a pending drop" },
      { does: "Shift-click another element", result: "Adds it to the selection" },
      { does: "Shift-click a selected element", result: "Takes it out of the selection" },
      { does: "Shift-drag on empty canvas", result: "Lassoes everything inside" },
      { does: "Click a pool or lane HEADER", result: "Selects the container", note: "the body of a white-box pool selects what is inside it instead" },
    ],
  },
  {
    heading: "Moving",
    gestures: [
      { does: "Drag an element", result: "Moves it", note: "4px before it counts, so a wobbly click is still a click" },
      { does: "Drag any element of a multi-selection", result: "Moves the whole group" },
      { does: "Drag a pool by its header", result: "Moves the pool and everything in it" },
      { does: "Arrow keys", result: "Nudges 5px — 1px with Shift", note: "each press is its own undo step" },
      { does: "Drag empty canvas", result: "Pans the diagram" },
    ],
  },
  {
    heading: "Resizing",
    gestures: [
      { does: "Drag a pool edge", result: "Moves that boundary only", note: "it stops at the first element it meets and never pushes anything" },
      { does: "Drag a lane or sub-lane divider", result: "Moves that divider only", note: "every other divider stays where it is" },
      { does: "Drag a corner handle", result: "Resizes both ways" },
      { does: "Press an edge and move ACROSS it", result: "Resizes" },
      { does: "Press an edge and move ALONG it", result: "Moves the shape", note: "the direction decides, not the distance" },
    ],
  },
  {
    heading: "Connecting",
    gestures: [
      { does: "Press and hold a selected element, then drag", result: "Draws a connector", note: "valid targets light up as you go; invalid ones never do" },
      { does: "Drag from a connection point", result: "Draws a connector from that side" },
      { does: "Release over empty canvas, or press Esc", result: "Cancels it" },
      { does: "Double-click a gateway with 3+ elements selected", result: "Fans them out of the gateway" },
    ],
  },
  {
    heading: "Editing",
    gestures: [
      { does: "Double-click an element or connector", result: "Zooms in and opens its label", note: "aimed at the text, not the middle of the shape" },
      { does: "Double-click a pool or lane header", result: "Opens the container's name" },
      { does: "Double-click a linked subprocess", result: "Drills into its diagram" },
      { does: "Right-click", result: "Opens the menu for what is under the pointer" },
      { does: "Delete or Backspace", result: "Removes the selection" },
    ],
  },
];
