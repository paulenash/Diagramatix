/**
 * Pictures of the real cursors, for the Canvas Help card.
 *
 * Paul, 22 September 2026: "The icons do not match closely enough to the real
 * cursor shapes." Emoji are drawings OF hands and arrows, in their own styles
 * and colours — ✋ is a palm, ✊ faces the wrong way, ↖ is a thin text arrow.
 * The cursors themselves are white shapes with a black outline, and these are
 * drawn the same way so the card shows what the screen will.
 *
 *   • grab — an open hand from the BACK: four big fingers slightly spread,
 *     thumb out to the LEFT.
 *   • grabbing — the same hand closed, still from the back: knuckles along the
 *     top, thumb folded across the left.
 *   • default — the standard arrow, not a text glyph.
 *   • the resize cursors — thick double-headed arrows in the same white and
 *     black as the hands; the corner ones are the same arrow on the diagonals.
 *
 *   • pointer — the pointing hand, in the same style: index finger up, the
 *     other three curled to knuckles, thumb on the left. It was the 👆 emoji
 *     at first ("the pointer looks great"), then brought into line with the
 *     other hands on Paul's request the same day.
 */

import type { CursorName } from "@/app/lib/canvas/pointerProtocol";
import { CURSOR_GLYPH } from "@/app/lib/canvas/pointerProtocol";

const FILL = "#ffffff";
const INK = "#111111";
const SW = 1.15;               // outline width, in the 24-unit box

/** Cursors that are drawn rather than shown as a glyph. */
export const DRAWN_CURSORS: readonly CursorName[] = [
  "grab", "grabbing", "pointer", "default", "crosshair", "move",
  "ew-resize", "ns-resize", "nwse-resize", "nesw-resize",
  "nw-resize", "ne-resize", "se-resize", "sw-resize",
];

/** One finger: a capsule from (x, top) down to `bottom`, tilted about its base. */
function Finger({ x, top, bottom, w, tilt }: { x: number; top: number; bottom: number; w: number; tilt: number }) {
  return (
    <rect x={x - w / 2} y={top} width={w} height={bottom - top} rx={w / 2}
      transform={`rotate(${tilt} ${x} ${bottom})`}
      fill={FILL} stroke={INK} strokeWidth={SW} />
  );
}

/** The open hand, back towards the viewer, thumb on the left. */
function OpenHand() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round" transform="translate(0.9 0)">
      {/* Fingers first, so the palm covers their bases. Big, slightly spread. */}
      <Finger x={8.2}  top={3.6} bottom={13} w={3.3} tilt={-7} />
      <Finger x={11.6} top={2.0} bottom={13} w={3.3} tilt={-2} />
      <Finger x={15.0} top={2.6} bottom={13} w={3.3} tilt={3} />
      <Finger x={18.2} top={4.8} bottom={13} w={3.0} tilt={9} />
      {/* Thumb, out to the LEFT and down. */}
      <rect x={4.0} y={11.0} width={3.2} height={6.4} rx={1.6}
        transform="rotate(-42 5.6 17.4)" fill={FILL} stroke={INK} strokeWidth={SW} />
      {/* Palm: filled over the finger bases, outlined on the outside only. */}
      <path d="M6.2 11.2 L20.1 11.2 L20.1 16.2 Q20.1 21.6 14.6 22.2 L11.2 22.2 Q7.1 21.9 5.6 17.4 Z"
        fill={FILL} stroke="none" />
      <path d="M20.1 11.8 L20.1 16.2 Q20.1 21.6 14.6 22.2 L11.2 22.2 Q7.1 21.9 5.6 17.4"
        fill="none" stroke={INK} strokeWidth={SW} />
    </g>
  );
}

/** The closed hand, back towards the viewer: knuckles on top, thumb folded left. */
function ClosedHand() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* Curled fingers show only as a row of knuckles. */}
      <Finger x={8.4}  top={6.4} bottom={12} w={3.3} tilt={-4} />
      <Finger x={11.8} top={5.6} bottom={12} w={3.3} tilt={0} />
      <Finger x={15.2} top={5.9} bottom={12} w={3.3} tilt={2} />
      <Finger x={18.4} top={7.2} bottom={12} w={3.0} tilt={6} />
      {/* Thumb folded against the left side — drawn BEFORE the back of the
          hand so the hand covers its root and it reads as attached. */}
      <rect x={4.4} y={11.0} width={3.3} height={7.2} rx={1.65}
        transform="rotate(-24 6.05 18.2)" fill={FILL} stroke={INK} strokeWidth={SW} />
      {/* Back of the hand. */}
      <path d="M6.6 9.6 L20.1 9.6 L20.1 16.0 Q20.1 21.4 14.8 21.9 L11.4 21.9 Q6.9 21.6 6.0 16.8 Z"
        fill={FILL} stroke="none" />
      <path d="M20.1 10.2 L20.1 16.0 Q20.1 21.4 14.8 21.9 L11.4 21.9 Q6.9 21.6 6.0 16.8"
        fill="none" stroke={INK} strokeWidth={SW} />
    </g>
  );
}

/** The pointing hand: index finger up, the rest curled, thumb on the left. */
function PointingHand() {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {/* The pointing finger, then three curled ones as knuckles. */}
      <Finger x={9.6}  top={1.6}  bottom={14} w={3.3} tilt={0} />
      <Finger x={12.9} top={8.6}  bottom={14} w={3.3} tilt={0} />
      <Finger x={16.2} top={9.2}  bottom={14} w={3.3} tilt={2} />
      <Finger x={19.3} top={10.4} bottom={14} w={3.0} tilt={6} />
      {/* Thumb, drawn before the hand so it reads as attached. */}
      <rect x={5.0} y={11.8} width={3.2} height={6.2} rx={1.6}
        transform="rotate(-40 6.6 18.0)" fill={FILL} stroke={INK} strokeWidth={SW} />
      {/* Back of the hand. */}
      <path d="M7.9 12.0 L20.8 12.0 L20.8 16.8 Q20.8 22.2 15.4 22.7 L12.0 22.7 Q8.0 22.4 6.8 18.0 Z"
        fill={FILL} stroke="none" />
      <path d="M20.8 12.6 L20.8 16.8 Q20.8 22.2 15.4 22.7 L12.0 22.7 Q8.0 22.4 6.8 18.0"
        fill="none" stroke={INK} strokeWidth={SW} />
    </g>
  );
}

/** The standard arrow. */
function Arrow() {
  return (
    <path d="M5.5 2.5 L5.5 19.2 L9.4 15.4 L12.1 21.6 L14.7 20.5 L12.1 14.4 L17.4 14.4 Z"
      fill={FILL} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
  );
}

/** A thick double-headed arrow along the x axis, rotated into place. */
function DoubleArrow({ angle, reach = 10 }: { angle: number; reach?: number }) {
  const a = reach, h = 4.6, s = 1.9, n = reach - 4.4;   // tip, head half-width, shaft half-width, neck
  const d = `M${12 - a} 12 L${12 - n} ${12 - h} L${12 - n} ${12 - s} L${12 + n} ${12 - s} ` +
            `L${12 + n} ${12 - h} L${12 + a} 12 L${12 + n} ${12 + h} L${12 + n} ${12 + s} ` +
            `L${12 - n} ${12 + s} L${12 - n} ${12 + h} Z`;
  return (
    <path d={d} transform={`rotate(${angle} 12 12)`}
      fill={FILL} stroke={INK} strokeWidth={SW} strokeLinejoin="round" />
  );
}

function Crosshair() {
  return (
    <g strokeLinecap="butt">
      <path d="M12 2.5 V21.5 M2.5 12 H21.5" stroke={FILL} strokeWidth={3.2} />
      <path d="M12 2.5 V21.5 M2.5 12 H21.5" stroke={INK} strokeWidth={1.2} />
    </g>
  );
}

function Move() {
  return (
    <g>
      <DoubleArrow angle={0} reach={10} />
      <DoubleArrow angle={90} reach={10} />
    </g>
  );
}

/**
 * A note from the protocol card, with every `{cursor-name}` drawn as the real
 * cursor, inline and text-sized. Anything in braces that is not a cursor name
 * is left as written.
 */
export function NoteWithCursors({ text }: { text: string }) {
  const parts = text.split(/\{([a-z-]+)\}/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part;                       // plain text between tokens
        const name = part as CursorName;
        return name in CURSOR_GLYPH
          ? <span key={i} className="inline-block align-[-2px] mx-px"><CursorIcon name={name} size={12} /></span>
          : `{${part}}`;
      })}
    </>
  );
}

export function CursorIcon({ name, size = 18 }: { name: CursorName; size?: number }) {
  if (!DRAWN_CURSORS.includes(name)) {
    return <span className="leading-none" style={{ fontSize: size * 0.78 }} aria-hidden>{CURSOR_GLYPH[name]}</span>;
  }
  const body = (() => {
    switch (name) {
      case "grab":         return <OpenHand />;
      case "grabbing":     return <ClosedHand />;
      case "pointer":      return <PointingHand />;
      case "default":      return <Arrow />;
      case "crosshair":    return <Crosshair />;
      case "move":         return <Move />;
      case "ew-resize":    return <DoubleArrow angle={0} />;
      case "ns-resize":    return <DoubleArrow angle={90} />;
      case "nwse-resize":
      case "nw-resize":
      case "se-resize":    return <DoubleArrow angle={45} reach={9.4} />;
      case "nesw-resize":
      case "ne-resize":
      case "sw-resize":    return <DoubleArrow angle={-45} reach={9.4} />;
      default:             return null;
    }
  })();
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      {body}
    </svg>
  );
}
