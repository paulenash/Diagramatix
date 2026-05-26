/**
 * Topic keys that the Canvas code is wired to fire bubble help for.
 * Admin-editable rows in /api/bubble-helps can use ANY topic key, but
 * a row whose key isn't in this set never triggers at runtime (the
 * code never calls `showBubbleHelp("...")` for it). The Bubble Help
 * admin editor highlights such rows in orange so the admin knows
 * they're staged but not yet implemented in code.
 *
 * To wire a new topic: add the key here AND add a `showBubbleHelp(key,
 * anchor)` call at the desired trigger point in Canvas.tsx (or
 * wherever fits).
 */
export const IMPLEMENTED_BUBBLE_TOPICS: ReadonlySet<string> = new Set([
  "create-connector",
  "select-multiple",
  "pool-header",
  "lane-header",
  // EP-body trigger: topic key matches the row the admin created
  // on prod ("Enhanced Subprocess Usage"). The earlier seeded
  // key ("ep-body") is intentionally dropped — admin should delete
  // the now-orphan ep-body row in the editor.
  "Enhanced Subprocess Usage",
  "start-event",
  "intermediate-event",
  "end-event",
]);
