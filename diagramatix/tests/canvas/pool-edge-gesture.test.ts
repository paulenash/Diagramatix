/**
 * T4557-T4559 — dragging a black-box pool.
 *
 * Paul, 2026-09-19: "I am having some difficulty move a black-box pool. When I
 * attempt to click and drag sometimes it works, sometimes it does not, the pool
 * remains selected but only the cursor moves, and sometimes the alignment green
 * markers appear the pool remains selected without moving. The green alignment
 * markers should disappear when I click elsewhere but they persist until I
 * explicitly remove them with <esc>."
 *
 * It was never flaky — it was positional, with nothing on screen to show it.
 * The edge hit-zones ran 10px INSIDE each edge across the container's whole
 * width, and the element's own mousedown refused to start a move anywhere in
 * that band because the hit-zone had not claimed the press. So inside the band
 * a drag could only ever resize. On a 78px-tall pool the two bands came to
 * 20px — a QUARTER of its height — and the only way to move it was to find the
 * middle 58px.
 *
 * The band is now decided by DIRECTION once the press becomes a drag: across
 * the edge resizes, along it moves.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DRAG_THRESHOLD, ALONG_RATIO, classifyEdgeDrag, edgeBand, isHorizontalEdge,
  type EdgeSide,
} from "@/app/lib/diagram/edgeGesture";
import { poolGuideNext, EMPTY_POOL_GUIDE, type PoolBoundaryGuide } from "@/app/lib/diagram/poolGuide";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

describe("T4557 — a drag on an edge is read by its direction", () => {
  it("is not a drag at all until it clears the threshold", () => {
    // Under the threshold the press may still be a plain click, which must
    // fall through and select.
    for (const side of ["n", "s", "e", "w"] as EdgeSide[]) {
      expect(classifyEdgeDrag(side, 0, 0)).toBe("pending");
      expect(classifyEdgeDrag(side, DRAG_THRESHOLD, 0)).toBe("pending");
      expect(classifyEdgeDrag(side, 0, DRAG_THRESHOLD)).toBe("pending");
    }
  });

  it("resizes when the drag goes across the edge", () => {
    // Across is the direction the boundary itself can travel.
    expect(classifyEdgeDrag("n", 0, -40)).toBe("resize");
    expect(classifyEdgeDrag("s", 0, 40)).toBe("resize");
    expect(classifyEdgeDrag("e", 40, 0)).toBe("resize");
    expect(classifyEdgeDrag("w", -40, 0)).toBe("resize");
  });

  it("moves when the drag runs along the edge", () => {
    // The boundary cannot go that way, so the user meant the whole shape —
    // which is how you now slide a 78px pool sideways by grabbing its top.
    expect(classifyEdgeDrag("n", 60, 0)).toBe("move");
    expect(classifyEdgeDrag("s", -60, 0)).toBe("move");
    expect(classifyEdgeDrag("e", 0, 60)).toBe("move");
    expect(classifyEdgeDrag("w", 0, -60)).toBe("move");
  });

  it("keeps a slightly untidy resize a resize", () => {
    // Nobody drags exactly perpendicular. Only a clearly-along drag switches
    // to a move, so the common gesture is not stolen by a wobble.
    expect(classifyEdgeDrag("n", 20, -40)).toBe("resize");
    expect(classifyEdgeDrag("n", 39, -40)).toBe("resize");
    expect(ALONG_RATIO).toBeGreaterThan(1);
  });

  it("splits the two at the stated ratio, in both directions", () => {
    const across = 40;
    const justUnder = across * ALONG_RATIO - 1;
    const justOver = across * ALONG_RATIO + 1;
    expect(classifyEdgeDrag("n", justUnder, -across)).toBe("resize");
    expect(classifyEdgeDrag("n", justOver, -across)).toBe("move");
    // Sign must not matter — dragging left is as much "along" as right.
    expect(classifyEdgeDrag("n", -justOver, across)).toBe("move");
    expect(classifyEdgeDrag("e", -across, -justOver)).toBe("move");
  });

  it("knows which edges are horizontal", () => {
    expect(isHorizontalEdge("n")).toBe(true);
    expect(isHorizontalEdge("s")).toBe(true);
    expect(isHorizontalEdge("e")).toBe(false);
    expect(isHorizontalEdge("w")).toBe(false);
  });
});

describe("T4558 — the band no longer eats a quarter of a thin pool", () => {
  // Paul's pool, from his export.
  const W = 1004, H = 78;

  it("takes far less out of the shape than it used to", () => {
    const n = edgeBand("n", W, H), s = edgeBand("s", W, H);
    expect(n.inside + s.inside, "inside band total, was 20 of 78").toBeLessThanOrEqual(12);
    expect((n.inside + s.inside) / H).toBeLessThan(0.16);
  });

  it("is still generous OUTSIDE, where it costs nothing", () => {
    // Outside the edge is empty canvas, so a wide catch there makes the edge
    // easier to hit without taking anything from the pool.
    const b = edgeBand("n", W, H);
    expect(b.outside).toBeGreaterThanOrEqual(b.inside);
    expect(b.outside).toBeGreaterThanOrEqual(10);
  });

  it("does not shrink the band on a tall container", () => {
    // An Expanded Subprocess is hundreds of px tall; the cap must not make its
    // edges harder to grab than they were.
    const tall = edgeBand("n", 600, 400);
    expect(tall.inside).toBe(10);
  });

  it("keeps a usable band on a very short one", () => {
    // A fifth of 20px is 4 — the floor — rather than something unclickable.
    expect(edgeBand("n", 400, 20).inside).toBeGreaterThanOrEqual(4);
    expect(edgeBand("n", 400, 8).inside).toBeGreaterThanOrEqual(4);
  });

  it("sizes a vertical edge from the WIDTH", () => {
    // Pools are ~1000px wide, so the side bands were never the problem.
    expect(edgeBand("e", W, H).inside).toBe(10);
  });

  it("leaves a real move zone across the whole height of Paul's pool", () => {
    // The point of the whole change: sweep the pool top to bottom and every
    // band must now be draggable, whether by the edge rule or the body.
    const n = edgeBand("n", W, H), s = edgeBand("s", W, H);
    for (let y = 0; y <= H; y += 2) {
      const onTopBand = y <= n.inside;
      const onBottomBand = y >= H - s.inside;
      const movable = (onTopBand || onBottomBand)
        // In a band: an along-the-edge drag moves it.
        ? classifyEdgeDrag(onTopBand ? "n" : "s", 60, 0) === "move"
        // Outside the bands: the body drag has always worked.
        : true;
      expect(movable, `y=${y} must be draggable`).toBe(true);
    }
  });
});

describe("T4559 — the alignment guide belongs to its gesture", () => {
  const guide: PoolBoundaryGuide = {
    side: "right", currentX: 500,
    others: [{ id: "p1", x: 500, midY: 100, isMoving: true }],
  };

  it("is retired when a new interaction starts", () => {
    const shown = poolGuideNext(EMPTY_POOL_GUIDE, { type: "propose", guide });
    expect(shown.guide).toBe(guide);
    expect(poolGuideNext(shown, { type: "gestureEnd" })).toEqual(EMPTY_POOL_GUIDE);
  });

  it("is cancelled on mousedown CAPTURE, so a click on another shape clears it", () => {
    // Bubble-phase would never see it: elements stopPropagation.
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    const capture = canvas.slice(canvas.indexOf("onMouseDownCapture={(e) => {"));
    const cancel = capture.indexOf('dispatchPoolGuide({ type: "gestureEnd" })');
    const handlerEnd = capture.indexOf("onMouseDown={handleBackgroundMouseDown}");
    expect(cancel, "the cancel is inside the capture handler").toBeGreaterThan(-1);
    expect(cancel).toBeLessThan(handlerEnd);
  });

  it("still clears on Escape and at the end of a real gesture", () => {
    // Both existing exits must survive the new one.
    expect(poolGuideNext({ guide, suppressed: false }, { type: "escape" }).guide).toBeNull();
    const canvas = read("app", "components", "canvas", "Canvas.tsx");
    expect(canvas).toContain('dispatchPoolGuide({ type: "escape" })');
    expect((canvas.match(/dispatchPoolGuide\(\{ type: "gestureEnd" \}\)/g) ?? []).length)
      .toBeGreaterThanOrEqual(3); // resize end, move end, and the new cancel
  });
});

describe("T4560 — the hit-zone owns the gesture, the element does not guess", () => {
  const renderer = read("app", "components", "canvas", "SymbolRenderer.tsx");

  it("classifies the drag instead of assuming a resize", () => {
    expect(renderer).toContain("classifyEdgeDrag(");
    expect(renderer).toContain('if (intent === "move") { beginElementDrag(reactEvt); return; }');
  });

  it("starts the move from the ORIGINAL press, not from 4px later", () => {
    // beginElementDrag measures its delta from the event it is given, so
    // handing it the live mousemove would make the pool jump by the threshold.
    expect(renderer).toContain("beginElementDrag(reactEvt)");
  });

  it("sizes every edge band from the shared rule", () => {
    expect((renderer.match(/edgeBand\("[nsew]"/g) ?? []).length).toBe(4);
  });

  it("no longer deselects a pool when the press might become a drag", () => {
    // Deselecting the thing the user is about to move is the opposite of what
    // they asked for; the canvas still deselects.
    const branch = renderer.slice(renderer.indexOf("// Black-box pool: clicks on"));
    const guard = branch.indexOf("if (!selected) onSelect(e);");
    expect(guard).toBeGreaterThan(-1);
    expect(branch.slice(0, guard), "the toggle-off is gone from this branch")
      .not.toContain("if (selected) onSelect();");
  });
});
