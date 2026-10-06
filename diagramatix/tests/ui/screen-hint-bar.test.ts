/**
 * T5265 — the hint line along the bottom of the Dashboard and Project screens (Paul, 2026-10-06): zoom and pan, and — on the Project screen —
 * the selection clicks, reworded to be accurate and shown as the Diagram screen shows its own. Each claim is checked against what the screen
 * really does, so the words cannot drift from the behaviour.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DASHBOARD_HINTS, PROJECT_SCREEN_HINTS, SCREEN_PAN_HINT, SCREEN_ZOOM_HINT } from "@/app/lib/screenHints";
import { ScreenHintBar } from "@/app/components/ScreenHintBar";

const read = (p: string) => readFileSync(p, "utf8");
const project = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
const dashboard = read("app/(dashboard)/dashboard/DashboardClient.tsx");

describe("T5265 the wording", () => {
  it("zoom is the BROWSER's, so it says 'the screen' and how to reset; pan is the scroll of the panel under the pointer", () => {
    expect(SCREEN_ZOOM_HINT).toBe("Ctrl+Scroll to zoom the screen (Ctrl+0 to reset)");
    expect(SCREEN_PAN_HINT).toBe("Scroll to pan the panel under the pointer");
    expect(DASHBOARD_HINTS.slice(0, 2)).toEqual([SCREEN_ZOOM_HINT, SCREEN_PAN_HINT]);
    expect(PROJECT_SCREEN_HINTS.slice(0, 2)).toEqual([SCREEN_ZOOM_HINT, SCREEN_PAN_HINT]);
  });
  it("the Project screen adds the selection clicks; the Dashboard does not claim any it lacks", () => {
    expect(PROJECT_SCREEN_HINTS).toContain("Ctrl+Click to add or remove from the selection");
    expect(PROJECT_SCREEN_HINTS).toContain("Shift+Click to select a range");
    expect(PROJECT_SCREEN_HINTS).toContain("Double-click to open");
    expect(PROJECT_SCREEN_HINTS).toContain("Esc to clear the selection");
    expect(DASHBOARD_HINTS.join(" ")).not.toMatch(/Ctrl\+Click|Shift\+Click|Esc/);
  });
});

describe("T5265 each claim is true of the screen", () => {
  it("neither screen has a zoom or wheel handler of its own — so Ctrl+Scroll really is the browser's page zoom, and scroll really scrolls", () => {
    for (const src of [project, dashboard]) {
      expect(src).not.toMatch(/onWheel|addEventListener\(["']wheel["']/);
      expect(src).not.toMatch(/style=\{\{[^}]*\bzoom:/);
    }
  });
  it("the Project screen: Ctrl / ⌘ click toggles, Shift click selects a range, Escape clears, double-click opens, right-click gives the menu, click shows the panel", () => {
    expect(project).toContain("const ctrl = mods.ctrlKey || mods.metaKey;");
    expect(project).toContain("const ctrl = e.ctrlKey || e.metaKey;");
    expect(project).toContain("mods.shiftKey && lastSelectedDiagramId");
    expect(project).toContain('if (e.key === "Escape") clearDiagramSelection();');
    expect(project).toContain("onDoubleClick={(e) => { e.preventDefault(); onOpen(diagram.id); }}");
    expect(project).toContain('openCtx(e, "diagram", d.id)');
    expect(project).toContain("setPreviewDiagramId(d.id); setPropertiesOpen(true);");
  });
  it("the Dashboard: a project tile has a right-click menu", () => {
    expect(dashboard).toContain("tileContextMenu");
    expect(dashboard).toMatch(/onContextMenu=/);
  });
});

describe("T5265 how it is shown", () => {
  it("small grey text on a pale rounded plate, hints joined by ·, as the Diagram screen's status bar", () => {
    const html = renderToStaticMarkup(createElement(ScreenHintBar, { hints: ["One", "Two", "Three"] }));
    expect(html).toContain("One · Two · Three");
    expect(html).toContain("text-xs text-gray-400 bg-white/80 px-2 py-1 rounded");
    expect(html).toContain('data-testid="screen-hints"');
    expect(read("app/components/canvas/Canvas.tsx")).toContain("text-xs text-gray-400 bg-white/80 px-2 py-1 rounded");
  });
  it("it is a row at the foot of each screen, not a plate over the content", () => {
    expect(read("app/components/ScreenHintBar.tsx")).toContain("shrink-0");
    expect(project).toContain("<ScreenHintBar hints={PROJECT_SCREEN_HINTS} />");
    expect(dashboard).toContain("<ScreenHintBar hints={DASHBOARD_HINTS} />");
  });
});
