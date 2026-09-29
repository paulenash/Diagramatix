/**
 * Voice Assist on the phone (mobile voice stage 5, 2026-09-29): the small pure
 * rules the phone's editing screen needs around the shared session hook
 * (app/hooks/useVoiceSession.ts) — tested without a phone.
 */
import { isHiddenOnCanvas } from "@/app/lib/diagram/diagramThumbnail";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

/** The words the session uses for "no pointer yet" — written for a mouse. */
const MOUSE_LINE = "move the mouse over the canvas first";

/**
 * A session line in the phone's words. The shared session says "move the mouse
 * over the canvas first" (applyAssistOps.ts) — on a phone the pointer is the
 * last tap.
 */
export function phoneWording(summary: string): string {
  return summary.split(MOUSE_LINE).join("tap the canvas where you mean, then say it again");
}

/** What the microphone is asking for right now: the last line, when it is a question the person must answer. */
export function currentQuestion(lines: readonly { summary: string }[]): string | null {
  const last = lines[lines.length - 1];
  if (!last) return null;
  const s = last.summary;
  return /\?\s*(?:—|-|$)|say a number|pick a |say “yes”|“yes” to confirm|which one/i.test(s) ? phoneWording(s) : null;
}

/** The last line asks for a yes or a no ("clear the diagram? — say “yes” to confirm"): the sheet offers the two buttons. */
export function askedYesNo(lines: readonly { summary: string }[]): boolean {
  const last = lines[lines.length - 1];
  return !!last && /say “yes”|“yes” to confirm/i.test(last.summary);
}

const same = (a: DiagramElement, b: DiagramElement) =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;

/**
 * What the last edit touched: a NEW CONNECTOR — the box around the two things it
 * joins, so a message or a flow is seen — else the last element, in drawing
 * order, that is new or moved/resized since `prev`. The view follows it. Null
 * when nothing was added or moved (a rename, a delete).
 */
export function lastEditedBox(prev: DiagramData | null, next: DiagramData): { x: number; y: number; width: number; height: number } | null {
  const seen = new Set((prev?.connectors ?? []).map((c) => c.id));
  const fresh = (next.connectors ?? []).filter((c) => !seen.has(c.id));
  const last = fresh[fresh.length - 1];
  if (last) {
    const byId = new Map(next.elements.map((e) => [e.id, e] as const));
    const ends = [byId.get(last.sourceId), byId.get(last.targetId)].filter((e): e is DiagramElement => !!e);
    if (ends.length) {
      const x = Math.min(...ends.map((e) => e.x)), y = Math.min(...ends.map((e) => e.y));
      return { x, y, width: Math.max(...ends.map((e) => e.x + e.width)) - x, height: Math.max(...ends.map((e) => e.y + e.height)) - y };
    }
  }
  const before = new Map((prev?.elements ?? []).map((e) => [e.id, e] as const));
  let hit: DiagramElement | null = null;
  for (const e of next.elements) {
    const p = before.get(e.id);
    if (!p || !same(p, e)) hit = e;
  }
  return hit ? { x: hit.x, y: hit.y, width: hit.width, height: hit.height } : null;
}

/** What tapping a numbered chip does: say the number, or — a message between two things — build "n to m". */
export function chipAction(flow: "pick" | "rename" | "divider" | "message-pair" | "message-one", n: number, current: string): { run: string } | { text: string } {
  if (flow !== "message-pair") return { run: String(n) };
  const t = current.trim();
  if (!t || /\bto\s+\d+/.test(t)) return { text: `${n} to ` };
  return { text: /\bto$/i.test(t) ? `${t} ${n}` : `${n} to ` };
}

/** How near a tap must be to a connector's line to pick it (diagram units; a finger is wider than a mouse). */
export const CONNECTOR_TAP_TOLERANCE = 18;

const distToSegment = (px: number, py: number, a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2));
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy));
};

/**
 * The connector whose line passes within `tol` of a point (diagram coordinates)
 * — the nearest, when several do — or null. Any connector type: a sequence
 * flow, a message, an association. A tap checks this BEFORE the element under
 * it, because a connector runs across a pool or lane, and the pool would win.
 */
export function connectorAt(data: DiagramData, x: number, y: number, tol: number = CONNECTOR_TAP_TOLERANCE): Connector | null {
  let best: Connector | null = null;
  let bestD = tol;
  for (const c of data.connectors ?? []) {
    if (c.type === "review-comment-link") continue;
    const pts = c.waypoints ?? [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const d = distToSegment(x, y, pts[i], pts[i + 1]);
      if (d <= bestD) { bestD = d; best = c; }
    }
  }
  return best;
}

/** The topmost element the picture shows under a point (diagram coordinates), or null. */
export function elementAt(data: DiagramData, x: number, y: number): DiagramElement | null {
  const hit = [...data.elements].reverse().find(
    (e) => e.type !== "review-comment" && e.type !== "text-annotation" && !isHiddenOnCanvas(e, data)
      && x >= e.x && x <= e.x + e.width && y >= e.y && y <= e.y + e.height,
  );
  return hit ?? null;
}

/**
 * A tap: selects the element under it (adding to the selection when
 * `multi`), or clears the selection on empty canvas. Returns the new selection.
 */
export function selectionAfterTap(current: readonly string[], hit: DiagramElement | null, multi: boolean): string[] {
  if (!hit) return multi ? [...current] : [];
  if (!multi) return current.length === 1 && current[0] === hit.id ? [] : [hit.id];
  return current.includes(hit.id) ? current.filter((id) => id !== hit.id) : [...current, hit.id];
}

/** A few things worth saying, for the sheet's "What can I say?". */
export const VOICE_EXAMPLES: readonly string[] = [
  "add task Check invoice after Receive order",
  "add a pool called Customer",
  "rename Check invoice to Verify invoice",
  "delete Pay supplier",
  "tap a connector, then “delete this” or “reverse this”",
  "tap two elements in order, then “connect these”",
  "delete connectors — or “remove messages”",
  "connect Receive order to Check invoice",
  "undo that",
  "again",
  "rename tasks — then say a number, then the new name",
  "clear the diagram",
  "stop",
];
