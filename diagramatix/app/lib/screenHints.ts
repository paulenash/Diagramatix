/**
 * The one-line hints along the bottom of the Dashboard and Project screens — the same idea as the Diagram screen's status bar ("Drag to pan ·
 * Shift+Drag to select · Scroll to zoom …"), worded for what these screens actually do (Paul, 2026-10-06: "check and reword these to be
 * accurate").
 *
 * What is TRUE here, and why the words are what they are:
 *   • These screens have no zoom of their own. Ctrl+scroll is the BROWSER's page zoom (Ctrl+0 puts it back), so it is "zoom the screen",
 *     not "zoom the canvas".
 *   • Plain scroll moves whichever panel the pointer is over (the tiles, the navigation tree, the properties panel) — "pan".
 *   • Project screen only: Click selects and shows the Properties panel; Ctrl+Click (⌘ on a Mac) adds a diagram to, or removes it from, the
 *     selection; Shift+Click selects a range; Double-click opens; Right-click gives the menu; Esc clears the selection.
 *   • Dashboard only: right-click a project for its menu.
 */
export const SCREEN_ZOOM_HINT = "Ctrl+Scroll to zoom the screen (Ctrl+0 to reset)";
export const SCREEN_PAN_HINT = "Scroll to pan the panel under the pointer";

export const DASHBOARD_HINTS: readonly string[] = [
  SCREEN_ZOOM_HINT,
  SCREEN_PAN_HINT,
  "Right-click a project for more",
];

export const PROJECT_SCREEN_HINTS: readonly string[] = [
  SCREEN_ZOOM_HINT,
  SCREEN_PAN_HINT,
  "Click for properties",
  "Ctrl+Click to add or remove from the selection",
  "Shift+Click to select a range",
  "Double-click to open",
  "Right-click for more",
  "Esc to clear the selection",
];
