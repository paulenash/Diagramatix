/**
 * Shallow prop-equality for the memoised canvas renderers (CANVAS-05).
 *
 * Canvas recreates every handler CLOSURE on each render (inline arrows capturing
 * el.id), but they behave identically, so FUNCTION props are ignored here — that
 * is what lets React.memo actually skip work on a pan/zoom frame, where no data
 * changed. Arrays are compared one level deep so a fresh `.slice()` whose entries
 * are stable counts as equal (e.g. ConnectorRenderer's otherConnectorWaypoints).
 * Every other value is compared by reference: `element` / `colorConfig` get a new
 * reference on a genuine change (immutable reducer updates) and are ref-stable
 * during pan/zoom. Any real non-function change → return false → re-render.
 *
 * The trade-off: an ignored closure that captured now-stale state could keep an
 * old behaviour on an element whose data props did NOT change. In practice the
 * flag props (selected, isDropTarget, …) flip exactly when the relevant state
 * changes, so the affected element re-renders with a fresh closure; unaffected
 * elements captured the same state anyway.
 */
export function canvasMemoEqual<P extends Record<string, unknown>>(prev: P, next: P): boolean {
  for (const k of Object.keys(next)) {
    const nv = next[k];
    if (typeof nv === "function") continue;         // handler closures — ignore
    const pv = prev[k];
    if (Object.is(pv, nv)) continue;
    if (Array.isArray(nv) && Array.isArray(pv) && nv.length === pv.length) {
      let same = true;
      for (let i = 0; i < nv.length; i++) { if (!Object.is(nv[i], pv[i])) { same = false; break; } }
      if (same) continue;                            // same entries → equal
    }
    return false;                                    // a real (non-function) prop changed
  }
  for (const k of Object.keys(prev)) {               // a prev key dropped in next
    if (typeof prev[k] === "function") continue;
    if (!(k in next)) return false;
  }
  return true;
}
