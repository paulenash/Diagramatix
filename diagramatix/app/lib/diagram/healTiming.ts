/**
 * When may heal-on-load run? (connector-endpoint plan, slice 5 — Paul, 2026-10-05: "it flashes the connectors but does not
 * repair them or allow undo".)
 *
 * With co-authoring live, the editor re-fetches the committed diagram on entry and REPLACES its state with it, and that
 * replacement (`setData`) also clears the undo history. A heal made before the replacement lands is thrown away — the
 * connectors flash, nothing is repaired, and there is nothing to undo. So: when the reload-on-entry is going to happen,
 * the heal waits until it has finished; when it is not (no co-authoring, or read-only), the heal may run at once.
 *
 * Pure.
 */
export function healMayRun(s: { /** co-authoring is live for this session, so the editor will reload the committed diagram */ collabLive: boolean; /** that reload has finished */ freshLoadDone: boolean }): boolean {
  return !s.collabLive || s.freshLoadDone;
}
