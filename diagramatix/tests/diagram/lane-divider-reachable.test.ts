/**
 * T4647–T4648 — a lane / sub-lane divider can actually be grabbed.
 *
 * Paul, 21 September 2026: "Check that I can select the intermediate Lane and
 * sublane boundaries. This is intermittent at the moment."
 *
 * Intermittent is the tell. The divider hit-strips were rendered with the
 * lanes — BEFORE the connector layer and before the elements — so any shape
 * crossing the boundary took the mousedown instead. A divider runs the full
 * width of its pool, so almost everything in a diagram crosses one somewhere:
 * the strip answered along the empty stretches and did nothing where the
 * process actually was, which is exactly where you reach for it.
 *
 * The canvas already had this fix for the pool's own edges — `selectedResize
 * Container` re-renders those zones above the connector layers "so a connector
 * routed through/across the container can't intercept the mousedown". The lane
 * dividers never got it. They have it now, and are drawn immediately before
 * that same overlay.
 *
 * A second, quieter fault came out with it: both strips hardcoded the header
 * width (30 for a pool, 36 for a lane) instead of reading the container's own.
 * A multi-line pool name widens that strip past 30, so the divider started
 * INSIDE the header — covering the band you click to select the pool.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { containerHeaderWidth } from "@/app/lib/diagram/containerHeader";
import type { DiagramElement } from "@/app/lib/diagram/types";

const CANVAS = readFileSync(join(process.cwd(), "app", "components", "canvas", "Canvas.tsx"), "utf8");
const lineOf = (needle: string) => {
  const at = CANVAS.indexOf(needle);
  expect(at, `not found: ${needle}`).toBeGreaterThan(-1);
  return CANVAS.slice(0, at).split("\n").length;
};

describe("T4647 — the divider strips are drawn above what crosses them", () => {
  const laneStrips = () => lineOf("Lane boundary drag handles — shown between adjacent lanes");
  const subStrips = () => lineOf("Sublane boundary drag handles — between adjacent sublanes");

  it("comes after the connector layer", () => {
    const connectors = lineOf("Regular connectors — rendered behind elements");
    expect(laneStrips(), "lane dividers still under the connectors").toBeGreaterThan(connectors);
    expect(subStrips(), "sublane dividers still under the connectors").toBeGreaterThan(connectors);
  });

  it("comes after the element layer", () => {
    const elements = lineOf("Non-container elements. Review comments are pulled OUT here");
    expect(laneStrips(), "lane dividers still under the elements").toBeGreaterThan(elements);
    expect(subStrips(), "sublane dividers still under the elements").toBeGreaterThan(elements);
  });

  it("sits with the pool edge-zone overlay that exists for the same reason", () => {
    const poolEdges = lineOf("Selected container (pool / EP / process-group) edge-resize");
    expect(laneStrips()).toBeLessThan(poolEdges);
    expect(subStrips()).toBeLessThan(poolEdges);
  });

  it("still only offers a strip where there IS a divider", () => {
    // Two bands make one divider; one band makes none. Guards the early-out,
    // which a move like this is easy to drop.
    expect(CANVAS).toMatch(/if \(poolLanes\.length < 2\) return \[\];/);
    expect(CANVAS).toMatch(/if \(sublanes\.length < 2\) return \[\];/);
  });
});

describe("T4648 — the strip starts where the header ends", () => {
  it("asks the container for its header width", () => {
    expect(CANVAS, "pool header width is hardcoded again").not.toMatch(/const POOL_LW = 30;/);
    expect(CANVAS, "lane header width is hardcoded again").not.toMatch(/const LANE_LW = 36;/);
    expect(CANVAS).toMatch(/const POOL_LW = containerHeaderWidth\(pool\);/);
    expect(CANVAS).toMatch(/const LANE_LW = containerHeaderWidth\(parentLane\);/);
  });

  it("a wide header pushes the strip clear of the band you click to select", () => {
    // The case the hardcoded 30 got wrong: a multi-line pool name widens the
    // header past it, and the divider then covered part of the header.
    const wide = { id: "p", type: "pool", label: "Order\nFulfilment\nTeam", x: 0, y: 0, width: 800, height: 400, properties: { poolHeaderWidth: 58 } } as unknown as DiagramElement;
    expect(containerHeaderWidth(wide)).toBe(58);
    expect(containerHeaderWidth(wide)).toBeGreaterThan(30);
    const plain = { id: "q", type: "pool", label: "Sales", x: 0, y: 0, width: 800, height: 400, properties: {} } as unknown as DiagramElement;
    expect(containerHeaderWidth(plain), "the default is unchanged").toBe(36);
  });
});
