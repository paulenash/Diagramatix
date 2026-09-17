/**
 * The edit zoom: when you open a name editor, the canvas snaps in so the text
 * is readable while you type.
 *
 * The snap only ever zooms IN, which is right — if the thing is already large,
 * moving the canvas is more disruptive than helpful. But that rule quietly
 * skipped every wide container. An expanded subprocess is hundreds of world
 * units across, so the ideal zoom came out below the current zoom, the snap
 * returned null, and you typed the name at whatever zoom you were at. Pools and
 * lanes had already been special-cased for exactly this; expanded subprocesses,
 * groups, system boundaries and composite states had not.
 */
import { describe, it, expect } from "vitest";
import {
  planEditZoomAim,
  computeEditZoom,
  clampEditZoomFraction,
  isHeaderStripContainer,
  HEADER_H,
  CONTAINER_NAME_ZOOM_W,
  CONTAINER_NAME_EDITOR_W,
  DEFAULT_EDIT_ZOOM_FRACTION,
  MAX_EDIT_ZOOM,
  MIN_EDIT_ZOOM_WIDTH,
} from "@/app/lib/diagram/labelEditZoom";
import type { DiagramElement, SymbolType } from "@/app/lib/diagram/types";

/** A typical editor viewport. */
const VIEWPORT = 1200;

const el = (
  type: SymbolType,
  width: number,
  height: number,
  properties: Record<string, unknown> = {},
): DiagramElement =>
  ({
    id: `${type}-1`,
    type,
    x: 100,
    y: 200,
    width,
    height,
    label: "",
    properties,
  }) as unknown as DiagramElement;

describe("T4461 — a wide container's name editor now zooms", () => {
  const EP = el("subprocess-expanded", 600, 320);

  it("did not zoom when the snap was aimed at the whole container", () => {
    // The defect, stated as a fact about the maths: a 600-wide box at 1:1 wants
    // an ideal zoom of 0.4, which is less than the 1.0 it is already at, so the
    // only-zoom-in rule correctly refuses. Aiming at the box was the mistake.
    expect(computeEditZoom(EP.width, 1, VIEWPORT)).toBeNull();
  });

  it("zooms now that the snap is aimed at the header strip", () => {
    const aim = planEditZoomAim(EP);
    const zoom = computeEditZoom(aim.worldWidth, 1, VIEWPORT);
    expect(zoom).not.toBeNull();
    expect(zoom!).toBeGreaterThan(1);
  });

  it("aims at the header strip, not the middle of the box", () => {
    const aim = planEditZoomAim(EP);
    expect(aim.centerY).toBe(EP.y + HEADER_H / 2);
    expect(aim.centerY).toBeLessThan(EP.y + EP.height / 2);
    expect(aim.centerX).toBe(EP.x + EP.width / 2);
  });

  it("covers every header-strip container, not just the expanded subprocess", () => {
    for (const type of ["subprocess-expanded", "group", "system-boundary", "composite-state"] as SymbolType[]) {
      expect(isHeaderStripContainer(type)).toBe(true);
      const aim = planEditZoomAim(el(type, 500, 300));
      expect(computeEditZoom(aim.worldWidth, 1, VIEWPORT), `${type} did not zoom`).not.toBeNull();
    }
  });

  it("leaves a container that is already big enough alone", () => {
    // Zoomed well in already: snapping would move the canvas for no gain.
    expect(computeEditZoom(planEditZoomAim(EP).worldWidth, 2.5, VIEWPORT)).toBeNull();
  });
});

describe("T4462 — the zoom target is small enough to actually fire", () => {
  it("is narrower than the point where the default fraction stops zooming", () => {
    // At the default fraction the ideal zoom is fraction * viewport / width, so
    // any target at or above fraction * viewport lands at zoom <= 1 and the snap
    // never fires from 1:1. This is the trap the first attempt fell into: 240 is
    // exactly the break-even width at a 1200px viewport.
    const breakEven = DEFAULT_EDIT_ZOOM_FRACTION * VIEWPORT;
    expect(CONTAINER_NAME_ZOOM_W).toBeLessThan(breakEven);
    expect(computeEditZoom(breakEven, 1, VIEWPORT)).toBeNull();
  });

  it("keeps the editor on screen at the zoom it snaps to", () => {
    const aim = planEditZoomAim(el("subprocess-expanded", 900, 400));
    const zoom = computeEditZoom(aim.worldWidth, 1, VIEWPORT)!;
    expect(CONTAINER_NAME_EDITOR_W * zoom).toBeLessThanOrEqual(VIEWPORT);
  });

  it("does not shrink the editor on a container that was already narrow", () => {
    // A small container keeps a full-width editor, exactly as before the change.
    const narrow = el("group", 200, 150);
    expect(Math.min(narrow.width, CONTAINER_NAME_EDITOR_W)).toBe(narrow.width);
  });
});

describe("T4463 — the other types keep the aim they had", () => {
  it("still aims a pool at its own text region, right of the header bar", () => {
    const pool = el("pool", 800, 300);
    const aim = planEditZoomAim(pool);
    expect(aim.worldWidth).toBe(180);
    expect(aim.centerX).toBe(pool.x + 36 + 90);
    expect(computeEditZoom(aim.worldWidth, 1, VIEWPORT)).not.toBeNull();
  });

  it("honours a resized pool header bar", () => {
    const pool = el("pool", 800, 300, { poolHeaderWidth: 60 });
    expect(planEditZoomAim(pool).centerX).toBe(pool.x + 60 + 90);
  });

  it("still aims a data object below the shape, where its name is drawn", () => {
    const dob = el("data-object", 40, 50);
    const aim = planEditZoomAim(dob);
    expect(aim.centerY).toBe(dob.y + dob.height + 14);
    expect(aim.worldWidth).toBe(150);
  });

  it("still aims an ordinary task at the middle of the shape", () => {
    const task = el("task", 120, 80);
    const aim = planEditZoomAim(task);
    expect(aim.centerX).toBe(task.x + 60);
    expect(aim.centerY).toBe(task.y + 40);
    expect(aim.worldWidth).toBe(task.width);
  });
});

describe("T4464 — the zoom maths stays inside its limits", () => {
  it("never zooms past the ceiling, however small the target", () => {
    // Needs a viewport wide enough that the ideal zoom EXCEEDS the ceiling.
    // At 1200px the minimum-width clamp already caps the ideal at exactly 4, so
    // a test there passes whether the ceiling exists or not — it proves nothing.
    const WIDE = 3000;
    expect(computeEditZoom(MIN_EDIT_ZOOM_WIDTH, 1, WIDE, 0.2)).toBeGreaterThan(MAX_EDIT_ZOOM - 0.001);
    expect(computeEditZoom(1, 1, WIDE)).toBe(MAX_EDIT_ZOOM);
    expect(computeEditZoom(10, 1, WIDE)).toBe(MAX_EDIT_ZOOM);
  });

  it("does not let a tiny label drive an absurd zoom", () => {
    // A target below the floor width is treated as the floor width, so a 10-wide
    // and a 60-wide label snap to the same zoom. The fraction is turned right
    // down on purpose: at the default the ceiling would pin both results to 4
    // and the test would pass whether the floor existed or not.
    const TINY_FRACTION = 0.01;
    const tiny = computeEditZoom(10, 0.1, VIEWPORT, TINY_FRACTION);
    const floor = computeEditZoom(MIN_EDIT_ZOOM_WIDTH, 0.1, VIEWPORT, TINY_FRACTION);
    expect(tiny).toBe(floor);
    expect(tiny!).toBeLessThan(MAX_EDIT_ZOOM);
  });

  it("returns null when the viewport has not been measured", () => {
    expect(computeEditZoom(120, 1, 0)).toBeNull();
  });

  it("clamps a malformed stored fraction instead of breaking the maths", () => {
    expect(clampEditZoomFraction(NaN)).toBe(DEFAULT_EDIT_ZOOM_FRACTION);
    expect(clampEditZoomFraction(0)).toBe(DEFAULT_EDIT_ZOOM_FRACTION);
    expect(clampEditZoomFraction(-1)).toBe(DEFAULT_EDIT_ZOOM_FRACTION);
    expect(clampEditZoomFraction(9)).toBe(0.95);
    expect(clampEditZoomFraction(0.001)).toBe(0.05);
    expect(clampEditZoomFraction(0.35)).toBe(0.35);
  });

  it("respects a user who turned the fraction down", () => {
    // A smaller fraction means a smaller snap, so a target that zooms at 0.2
    // may legitimately not zoom at 0.05. That is the setting working.
    const aim = planEditZoomAim(el("subprocess-expanded", 600, 320));
    expect(computeEditZoom(aim.worldWidth, 1, VIEWPORT, 0.05)).toBeNull();
    expect(computeEditZoom(aim.worldWidth, 1, VIEWPORT, 0.2)).not.toBeNull();
  });
});

describe("T4465 — Canvas uses the shared planner rather than its own copy", () => {
  it("has no second copy of the aim or the zoom maths", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const src = readFileSync(
      join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"),
      "utf8",
    );
    // Two copies of a geometry rule is how pools got fixed and expanded
    // subprocesses did not. The component must call the planner, not restate it.
    expect(src).toContain("planEditZoomAim(el)");
    expect(src).toContain("computeEditZoom(");
    expect(src).not.toMatch(/const\s+idealZoom\s*=/);
    expect(src).not.toMatch(/Math\.max\(60,\s*worldWidth\)/);
  });
});
