/**
 * A Dev Tools trace for canvas gestures — off unless asked for.
 *
 * Paul, 22 September 2026, on moving a pool's left boundary: "De-selecting the
 * Pool and choosing to move the boundary again then starts to cause lots of
 * weird effects. Elements move left and sometimes downwards. Investigate and
 * fix or perhaps insert debug code for Dev Tools?"
 *
 * The reducer was replayed through three left-boundary drags in a row and not
 * one element moved, so the fault is in which HANDLER takes the press — the
 * resize zone on the edge, or the header strip right beside it that moves the
 * whole pool — and that only a live session can show. This makes it visible.
 *
 * TURN ON, in the Dev Tools console:
 *     localStorage.setItem("dgx.traceGestures", "1")   then reload
 *   or, for this page only:
 *     window.__DGX_TRACE_GESTURES = true
 * TURN OFF:
 *     localStorage.removeItem("dgx.traceGestures")      then reload
 *
 * Each press logs which handler took it and what it decided; each move or
 * resize logs every element that moved and by how much. Nothing is sent
 * anywhere — it is console output only.
 */

declare global {
  interface Window { __DGX_TRACE_GESTURES?: boolean }
}

let readStorage = false;

/** Is the trace on? Cheap when off: one window property read. */
export function gestureTraceOn(): boolean {
  if (typeof window === "undefined") return false;
  if (!readStorage) {
    readStorage = true;
    try {
      if (window.localStorage?.getItem("dgx.traceGestures") === "1") window.__DGX_TRACE_GESTURES = true;
    } catch { /* storage blocked — the window flag still works */ }
  }
  return window.__DGX_TRACE_GESTURES === true;
}

/** Log one gesture event, if the trace is on. */
export function traceGesture(event: string, detail: Record<string, unknown> = {}): void {
  if (!gestureTraceOn()) return;
  // eslint-disable-next-line no-console
  console.log(`%c[gesture] ${event}`, "color:#7c3aed;font-weight:bold", detail);
}

export interface Moved { id: string; type: string; label?: string; dx: number; dy: number; dw: number; dh: number }

/**
 * Every element whose position or size changed between two states — the
 * answer to "what moved when I did that". Pure.
 */
export function movedElements(
  before: readonly { id: string; type: string; label?: string; x: number; y: number; width: number; height: number }[],
  after: readonly { id: string; type: string; label?: string; x: number; y: number; width: number; height: number }[],
): Moved[] {
  const was = new Map(before.map((e) => [e.id, e] as const));
  const out: Moved[] = [];
  for (const e of after) {
    const o = was.get(e.id);
    if (!o) continue;
    const dx = e.x - o.x, dy = e.y - o.y, dw = e.width - o.width, dh = e.height - o.height;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dw) > 0.01 || Math.abs(dh) > 0.01) {
      out.push({ id: e.id, type: e.type, label: e.label, dx: round(dx), dy: round(dy), dw: round(dw), dh: round(dh) });
    }
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;
