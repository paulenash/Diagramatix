/**
 * "Move dividers" — numbers ON the lane dividers, then "<n> up 100 pixels".
 *
 * Paul, 2026-09-27, after a flaky boundary session: "I think the best way to
 * fix the problem is introduce a new command: 1. say "move dividers" 2.
 * Numbers appear on the lane dividers themselves. 3. <n> up 100 pixels, or
 * 4. <n> down 2 tasks — subject to the current constraints. This should be
 * very reliable!!"
 *
 * Reliable because nothing is NAMED: the number says which divider, the rest
 * says which way and how far. A number and "up" or "down" are the words the
 * recogniser gets right most often.
 *
 * A divider is the line between two neighbouring bands — two lanes in a pool,
 * or two sub-lanes in a lane — found exactly as the boundary command finds
 * one (laneBoundary.ts: the bands with the same parent, top to bottom), so
 * the answer runs through the SAME move as "move <lane> top boundary up": the
 * mouse's MOVE_LANE_BOUNDARY and its floor.
 *
 * But NOT the boundary command's refusal to run the line through anything
 * (Paul, 2026-09-28): "move dividers should move the lane boundaries without
 * any constraint concerning the elements on the diagram. The only constraints
 * should be a) the new lane/sublane heights must allow the lane/sublane names
 * to be displayed, BUT wrapping the lane/sublane name to 2 lines … must be
 * tried if it is possible. b) the pool boundary, of course." So its op carries
 * `overContent`: what the line passes joins the lane it is now in, nothing
 * moves on the page, and a name at its floor wraps to let the band go on.
 *
 * The numbers stay up after each move — the next answer can nudge again —
 * until "done", Escape, stop, or a whole new command.
 *
 * Pure.
 */
import type { DiagramElement } from "../diagram/types";
import type { AssistOp } from "./ops";
import type { RenameTarget } from "./renameTargets";
import { isAnyLane } from "../diagram/laneKind";
import { containerHeaderWidth } from "../diagram/containerHeader";
import { readDistance, readLoneAmount } from "./poolBoundaryPhrase";
import { leadingSpokenNumber } from "./spokenNumber";
import { ID_REF_PREFIX } from "./resolveRef";

/**
 * "move dividers", "move divider", "move lane dividers", "move lane divider"
 * (Paul, 2026-09-28: "Recognise all the following … for the command"), with
 * "the"/"a"/"all the", "sub-lane" or the recogniser's "line", a possessive
 * the recogniser writes ("divider's", "lanes' dividers"), and a trailing
 * "please"/"now" — the forms that used to be held as half a move instead.
 * Also "adjust", "show", "number", "pick".
 */
export const DIVIDER_COMMAND_RE = /^(?:move|adjust|show|number|pick)\s+(?:(?:the|a|all(?:\s+the)?)\s+)?(?:(?:lane|sub-?lane|line)s?['’]?s?\s+)?dividers?(?:['’]s?)?(?:\s+(?:please|now))?$/i;

/** One divider, numbered: the band above it and the band below it. */
export interface DividerTarget extends RenameTarget {
  kind: "divider";
  aboveId: string;
  belowId: string;
}

/** The open flow — its numbers are recomputed from the diagram as it stands. */
export interface DividerFlow {
  prompt: string;
}

/** Every divider, numbered top to bottom (then left to right), each badge ON its line. */
export function collectDividers(els: readonly DiagramElement[]): DividerTarget[] {
  const parents = els.filter((e) => e.type === "pool" || isAnyLane(e));
  const raw: Array<Omit<DividerTarget, "n">> = [];
  for (const parent of parents) {
    const stack = els.filter((e) => isAnyLane(e) && e.parentId === parent.id).sort((a, b) => a.y - b.y);
    for (let i = 1; i < stack.length; i++) {
      const above = stack[i - 1], below = stack[i];
      raw.push({
        id: `divider:${above.id}|${below.id}`, kind: "divider", aboveId: above.id, belowId: below.id,
        // Just inside the band's body, clear of its name strip — sub-lane
        // dividers sit further right than lane dividers, so they never share a spot.
        x: below.x + containerHeaderWidth(below) + 22, y: below.y, height: 0,
        label: `${spoken(above)} / ${spoken(below)}`,
      });
    }
  }
  return raw
    .sort((a, b) => Math.round(a.y) - Math.round(b.y) || a.x - b.x)
    .map((d, i) => ({ ...d, n: i + 1 }));
}

/** Open the flow — or say why there is nothing to number. */
export function buildDividerFlow(els: readonly DiagramElement[]): DividerFlow | { error: string } {
  const n = collectDividers(els).length;
  if (!n) return { error: "there are no lane dividers here — a pool needs two lanes (or a lane two sub-lanes)" };
  return { prompt: `${n} divider${n === 1 ? "" : "s"} numbered — say “<n> up 100 pixels”, “<n> down 2 tasks”… then “done”` };
}

export interface DividerAnswer {
  target: DividerTarget;
  direction: "up" | "down";
  /** Pixels, when a distance was said; otherwise the boundary step. */
  distance?: number;
}

/**
 * "2 up 100 pixels", "two down 2 tasks", "number 3 up by forty", "move 1 down
 * a bit", "3 up" (one step). The number first, then the way, then how far —
 * read by the boundary command's own distance reader.
 */
export function parseDividerAnswer(text: string, targets: readonly DividerTarget[]): DividerAnswer | null {
  const t = String(text ?? "").trim().replace(/[.,!?]+$/g, "").replace(/^(?:move|shift|nudge|put)\s+/i, "").replace(/^divider\s+/i, "");
  const lead = leadingSpokenNumber(t);
  if (!lead) return null;
  const target = targets.find((d) => d.n === lead.n);
  if (!target) return null;
  const words = lead.rest.toLowerCase().split(/\s+/).filter(Boolean);
  const at = words.findIndex((w) => /^(?:up|upwards?|higher|raise)$/.test(w) || /^(?:down|downwards?|lower)$/.test(w));
  if (at < 0) return null;
  const direction = /^(?:up|upwards?|higher|raise)$/.test(words[at]) ? "up" : "down";
  const amount = readDistance(words.map((w, i) => (i === at ? "" : w)), true);
  return { target, direction, ...(amount ? { distance: amount.px } : {}) };
}

/**
 * What to say when an utterance is not an answer — as specific as it can be,
 * because the flow's whole point is not to leave the user guessing.
 */
export function explainDividerMiss(text: string, targets: readonly DividerTarget[]): string {
  const t = String(text ?? "").trim().replace(/[.,!?]+$/g, "").replace(/^(?:move|shift|nudge|put)\s+/i, "").replace(/^divider\s+/i, "");
  const lead = leadingSpokenNumber(t);
  if (lead && !targets.some((d) => d.n === lead.n)) {
    return targets.length === 1 ? `there’s only divider 1 — say “1 up 100 pixels”` : `there’s no divider ${lead.n} — say 1–${targets.length}, then up or down`;
  }
  if (lead) return `say “${lead.n} up …” or “${lead.n} down …” — and how far, if not 20 pixels`;
  return "say “<n> up 100 pixels” or “<n> down 2 tasks” — or “done”";
}

/** The boundary command's reply, in this flow's words: its “up by 64” is said here as “1 up 64”. */
export function dividerReply(summary: string, n: number): string {
  return summary.replace(/say “(up|down) by (\d+)”/, `say “${n} $1 $2”`);
}

/** The move itself: the boundary command on the band below the divider — its TOP is this line. */
export function dividerOp(a: DividerAnswer): AssistOp {
  return {
    op: "movePoolBoundary",
    ref: `${ID_REF_PREFIX}${a.target.belowId}`,
    boundary: "top",
    direction: a.direction,
    ...(a.distance !== undefined ? { distance: a.distance } : {}),
    // Paul, 2026-09-28: "move dividers" should move the lane boundaries
    // "without any constraint concerning the elements on the diagram" — only
    // the names (wrapped to two lines if that helps) and the pool.
    overContent: true,
  };
}

const spoken = (e: DiagramElement) => (e.label ?? "").replace(/\s+/g, " ").trim() || e.type;

/**
 * What the flow remembers between utterances (Paul's first "move dividers"
 * session, 2026-09-28). He paused inside his answers:
 *   "one" … "down two tasks" — the bare "one" was taken as "accept the first
 *     suggestion", which closed the flow; the rest went to the AI;
 *   "one down" … "fifty pixels" — the first half moved 20px, the second was no
 *     answer at all.
 * So a bare number is HELD (which divider — the way comes next), and an amount
 * said on its own after an answer makes that answer's move the amount IN ALL
 * ("one down" moved 20px, "fifty pixels" moves 30 more; had "one down" been
 * refused, the 50 is tried whole).
 *
 * Each is read only when it is nothing else: the way must come FIRST ("down two
 * tasks", never "move Salesforce down…"), and the amount must be ALL there is
 * ("fifty pixels", "by fifty", never "add Task 2") — so a whole new command
 * still closes the flow and runs.
 */
export interface DividerMemory {
  /** A number said on its own: the divider the next "up …"/"down …" is for. */
  pendingN?: number;
  /** The last answer — and how far it has moved, in its own direction, so far. */
  last?: { n: number; direction: "up" | "down"; moved: number };
}

export type DividerUtterance =
  | { kind: "move"; answer: DividerAnswer }
  | { kind: "hold"; n: number }
  | { kind: "adjust"; target: DividerTarget; direction: "up" | "down"; total: number }
  /** A bare number that is no divider — the flow explains, and stays open. */
  | { kind: "miss" };

const WAY_FIRST = /^(?:up|upwards?|higher|raise|down|downwards?|lower)\b/i;

export function readDividerUtterance(text: string, targets: readonly DividerTarget[], mem: DividerMemory): DividerUtterance | null {
  const t = String(text ?? "").trim().replace(/[.,!?]+$/g, "");
  const answer = parseDividerAnswer(t, targets);
  if (answer) return { kind: "move", answer };
  const bareT = t.replace(/^(?:move|shift|nudge|put)\s+/i, "").replace(/^(?:divider|number)\s+/i, "");
  // "down two tasks" after a held "one".
  if (mem.pendingN !== undefined && WAY_FIRST.test(bareT)) {
    const joined = parseDividerAnswer(`${mem.pendingN} ${bareT}`, targets);
    if (joined) return { kind: "move", answer: joined };
  }
  const lead = leadingSpokenNumber(bareT);
  // "one" — which divider; the way comes next.
  if (lead && !lead.rest) return targets.some((d) => d.n === lead.n) ? { kind: "hold", n: lead.n } : { kind: "miss" };
  // "fifty pixels" after an answer — that answer's move, to this much in all.
  if (mem.last) {
    const px = readLoneAmount(bareT.split(/\s+/), true);
    const target = targets.find((d) => d.n === mem.last!.n);
    if (px !== null && target) return { kind: "adjust", target, direction: mem.last.direction, total: px };
  }
  return null;
}

/** The op that makes the last move `total` px in all: the difference, either way. */
export function adjustOp(u: { target: DividerTarget; direction: "up" | "down"; total: number }, movedSoFar: number): AssistOp | null {
  const delta = Math.round(u.total - movedSoFar);
  if (!delta) return null;
  const direction = delta > 0 ? u.direction : (u.direction === "up" ? "down" : "up");
  return dividerOp({ target: u.target, direction, distance: Math.abs(delta) });
}

/** How far the boundary command says it moved ("… boundary down 60px …"), or 0 when it did not. */
export function movedPx(summary: string): number {
  const m = summary.match(/boundary (?:up|down) (\d+)px/);
  return m ? Number(m[1]) : 0;
}

/**
 * A ruler for "move dividers" (Paul, 2026-09-28: "mark the lane header inner
 * vertical boundary with green ticks every 100 px"): per pool with lanes, the
 * line where the lanes' name strips end, with a tick every 100px from the
 * pool's top — so "up 100 pixels" can be judged by eye.
 */
export interface DividerRuler { x: number; top: number; bottom: number; ticks: number[] }
export const RULER_STEP_PX = 100;
export function dividerRulers(els: readonly DiagramElement[]): DividerRuler[] {
  const out: DividerRuler[] = [];
  for (const pool of els.filter((e) => e.type === "pool")) {
    const lanes = els.filter((e) => isAnyLane(e) && e.parentId === pool.id);
    if (!lanes.length) continue;
    const x = Math.max(...lanes.map((l) => l.x + containerHeaderWidth(l)));
    const top = pool.y, bottom = pool.y + pool.height;
    const ticks: number[] = [];
    for (let y = top + RULER_STEP_PX; y < bottom; y += RULER_STEP_PX) ticks.push(y);
    out.push({ x, top, bottom, ticks });
  }
  return out;
}
