/**
 * T4666 — the bottom-right controls are one row, with zoom beside Auto-connect.
 *
 * Paul, 22 September 2026: "Move the zoom control next to Auto-connect to allow
 * more space."
 *
 * Each of the three controls used to be absolutely placed with a hard-coded
 * pixel offset. The zoom control's offset assumed Bubble help was always there
 * ("0.5rem + 156px + 6px + 130px + 6px"), so wherever Bubble help is hidden —
 * no help configured for the diagram type, or the global switch off — the zoom
 * bar stood ~136px out from Auto-connect across an empty gap. And any label
 * wider than the width it was guessed at would have overlapped its neighbour.
 *
 * One flex row, anchored bottom-right: each control takes its own width, a
 * hidden one leaves nothing behind, and the order is explicit.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CANVAS = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");
const rowStart = CANVAS.indexOf("Bottom-right controls, as ONE row");
const rowOpen = CANVAS.indexOf('<div className="absolute bottom-2 right-2 flex items-center gap-1.5 z-30">', rowStart);

/** The row's own markup, up to the first thing rendered after it. */
const row = CANVAS.slice(rowOpen, CANVAS.indexOf("{pendingArchiConn && (", rowOpen));

describe("T4666 — one row, zoom beside Auto-connect", () => {
  it("is a single flex container anchored bottom-right", () => {
    expect(rowStart, "no row comment").toBeGreaterThan(-1);
    expect(rowOpen, "no row container").toBeGreaterThan(rowStart);
  });

  it("holds all three, in the order Bubble help · Zoom · Auto-connect", () => {
    const bubble = row.indexOf("Bubble help:");
    const zoom = row.indexOf('title="Zoom out"');
    const auto = row.indexOf("Auto-connect:");
    expect(bubble, "Bubble help is not in the row").toBeGreaterThan(-1);
    expect(zoom, "the zoom bar is not in the row").toBeGreaterThan(-1);
    expect(auto, "Auto-connect is not in the row").toBeGreaterThan(-1);
    // Rendered left to right, so Auto-connect keeps the corner and zoom sits
    // immediately beside it.
    expect(bubble).toBeLessThan(zoom);
    expect(zoom).toBeLessThan(auto);
  });

  it("no control inside it positions itself any more", () => {
    // An absolute child would escape the row and bring the gap back. Skip the
    // row's own opening tag — the container is the one thing that IS placed.
    const children = row.slice(row.indexOf(">") + 1);
    expect(children).not.toMatch(/className=\{?`?"?absolute /);
    expect(children).not.toMatch(/style=\{\{ right: /);
  });

  it("and no hard-coded offset survives anywhere on the canvas", () => {
    expect(CANVAS).not.toMatch(/right: "calc\(0\.5rem \+ 156px/);
  });
});
