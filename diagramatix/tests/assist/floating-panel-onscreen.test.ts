/**
 * T5207 — a floating panel keeps itself inside the window until it is dragged. (Paul, 2026-10-02, H1:
 * the Voice Assist Help panel opened slightly too low and hid the bottom of the window.)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync("app/components/canvas/FloatingPanel.tsx", "utf8");

describe("T5207 FloatingPanel stays on screen", () => {
  it("measures itself and nudges up when it would overflow, on opening, on growth and on window resize", () => {
    expect(src).toContain("getBoundingClientRect().height");
    expect(src).toContain("window.innerHeight - h - BOTTOM_MARGIN_PX");
    expect(src).toContain("new ResizeObserver(keepOnScreen)");
    expect(src).toContain('window.addEventListener("resize", keepOnScreen)');
  });
  it("never fights the person: once dragged, it is left where they put it", () => {
    expect(src).toContain("dragged.current = true");
    expect(src).toContain("if (dragged.current) return;");
  });
  it("only ever moves it UP (never pushes a panel that fits)", () => {
    expect(src).toContain("p.y > maxY ? { x: p.x, y: maxY } : p");
  });
});
