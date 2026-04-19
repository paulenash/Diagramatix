/**
 * Module-level drag context for the AI Plan tabs.
 *
 * HTML5 drag-and-drop forbids reading `dataTransfer.getData()` during
 * `dragover` — you only get the type list. We need to check the group
 * (same pool for lanes, same container for elements) during dragover to
 * decide whether to accept the drop, so we stash the dragged row's id and
 * group key here at dragstart and read it from any row's dragover handler.
 *
 * Because the whole Plan panel lives inside one component tree and drags
 * are strictly within-tab, a module-level singleton is simpler than a
 * React context and avoids re-render churn on every drag event.
 */
let current: { id: string; groupKey: string } | null = null;

export function setDrag(info: { id: string; groupKey: string } | null) {
  current = info;
}

export function getDrag() {
  return current;
}
