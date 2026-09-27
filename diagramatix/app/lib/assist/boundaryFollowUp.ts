/**
 * A boundary command's follow-up — "sixty pixels", "up by 98", "down a bit" —
 * said straight after it, about the same boundary.
 *
 * Paul's session, 2026-09-28 (New-Command-Voice-Test-1-voice-debug (1)):
 *   "move finance boundary up" → "… it can move up at most 98px: say “up by 98”"
 *   "sixty pixels"             → "didn’t understand that"
 * The reply had asked for an amount, and he gave one — but an amount on its own
 * names nothing, so it went to the AI. Nor did the reply's own advice parse:
 * "up by 98" was no command at all.
 *
 * So the last lane-boundary or pool-edge command is remembered (applyAssistOps
 * writes it, with how far that boundary has moved so far) until any other
 * command runs, and the next utterance may finish it:
 *   - a way, with or without an amount — "up by 98", "down two tasks", "up" —
 *     is a fresh move of that boundary;
 *   - an amount on its own — "sixty pixels", "by sixty", "make it a hundred" —
 *     sets the move to that much IN ALL (as "move dividers" reads it,
 *     dividerFlow.ts): refused, the whole amount is tried; after 20px, 40 more.
 * Read only when nothing else parses (the editor asks the grammar first), so a
 * follow-up never shadows a command.
 *
 * Pure.
 */
import type { AssistOp } from "./ops";
import { ID_REF_PREFIX } from "./resolveRef";
import { readLoneAmount } from "./poolBoundaryPhrase";

type Side = "top" | "bottom" | "left" | "right";
type Way = "up" | "down" | "left" | "right";

/** The last boundary command, and how far that boundary has moved, net, in `direction`. */
export interface BoundaryMemory {
  /** The lane (its divider) or pool (its edge) the command moved. */
  targetId: string;
  boundary: Side;
  direction: Way;
  moved: number;
}

export type BoundaryFollowUp =
  | { op: AssistOp; inAll: boolean }
  | { reply: string };

const OPPOSITE: Record<Way, Way> = { up: "down", down: "up", left: "right", right: "left" };
const VERTICAL_WAYS: Record<string, Way> = { up: "up", upwards: "up", upward: "up", higher: "up", down: "down", downwards: "down", downward: "down", lower: "down" };
const SIDE_WAYS: Record<string, Way> = { left: "left", right: "right" };
/** Leading words that change nothing: "ok up by 98", "then sixty pixels". */
const LEAD = /^(?:(?:ok(?:ay)?|then|and|so|no|actually|well|try)\s+)+/;

/** The memory after another move of a boundary: consecutive moves of the SAME boundary add up. */
export function nextBoundaryMemory(prev: BoundaryMemory | null | undefined, m: BoundaryMemory): BoundaryMemory {
  if (!prev || prev.targetId !== m.targetId || prev.boundary !== m.boundary) return m;
  const net = prev.moved + (m.direction === prev.direction ? m.moved : -m.moved);
  if (net > 0) return { ...prev, moved: net };
  if (net < 0) return { ...prev, direction: OPPOSITE[prev.direction], moved: -net };
  return { ...m, moved: 0 };   // back where the series began: the latest way
}

export function readBoundaryFollowUp(text: string, mem: BoundaryMemory): BoundaryFollowUp | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[.,!?]+$/g, "").replace(/[,;:]/g, " ").replace(LEAD, "");
  const words = t.split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const vertical = mem.boundary === "top" || mem.boundary === "bottom";
  const op = (direction: Way, distance?: number): AssistOp => ({
    op: "movePoolBoundary", ref: `${ID_REF_PREFIX}${mem.targetId}`, boundary: mem.boundary, direction,
    ...(distance !== undefined ? { distance } : {}),
  });
  // "up by 98", "down two tasks", "up" — a fresh move that way.
  const way = (vertical ? VERTICAL_WAYS : SIDE_WAYS)[words[0]];
  if (way) {
    if (words.length === 1) return { op: op(way), inAll: false };
    const px = readLoneAmount(words.slice(1), vertical);
    return px === null ? null : { op: op(way, px), inAll: false };
  }
  // "sixty pixels" — this much in all.
  const px = readLoneAmount(words, vertical);
  if (px === null) return null;
  const delta = Math.round(px - mem.moved);
  if (!delta) return { reply: `it has moved ${px}px ${mem.direction} already` };
  return { op: op(delta > 0 ? mem.direction : OPPOSITE[mem.direction], Math.abs(delta)), inAll: true };
}
