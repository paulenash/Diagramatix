import { describe, it, expect } from "vitest";
import { orderBackdropContainers } from "@/app/components/simulation/replay/ReplayDiagramBackdrop";
import type { DiagramElement } from "@/app/lib/diagram/types";

/**
 * T2841 — Replay backdrop container paint order (the "invisible EP box" bug).
 *
 * In P01 the expanded subprocess was parented to the POOL, not the lane it
 * visually sits inside, so parentId depth tied it with the lane. On a depth-only
 * sort the full-diagram lane painted AFTER (over) the EP box, hiding it — only
 * the EP's children (drawn last) still showed. orderBackdropContainers must rank
 * pool → lane → subprocess so the lane is always BEHIND the EP regardless of the
 * stale parent.
 */
const el = (id: string, type: string, parentId: string | undefined, x: number, y: number, w: number, h: number): DiagramElement =>
  ({ id, type, parentId, x, y, width: w, height: h, label: id, properties: {} } as unknown as DiagramElement);

describe("orderBackdropContainers", () => {
  it("paints a pool-parented EP AFTER (in front of) the lane it visually sits in", () => {
    // Mirrors P01: pool → lane (full width) + EP both parented to the pool.
    const els = [
      el("ep", "subprocess-expanded", "pool", 378, 186, 405, 150), // parented to pool, not lane
      el("task-inside-ep", "task", "ep", 400, 220, 80, 40),
      el("pool", "pool", undefined, 46, -58, 1398, 620),
      el("lane", "lane", "pool", 82, -58, 1362, 620), // full-diagram lane, over the EP
    ];
    const order = orderBackdropContainers(els).map((e) => e.id);
    expect(order).toEqual(["pool", "lane", "ep"]);
    // The EP must be painted last (front-most) so the giant lane can't cover it.
    expect(order.indexOf("ep")).toBeGreaterThan(order.indexOf("lane"));
  });

  it("keeps pool behind lane behind sub-lane, and larger behind smaller on ties", () => {
    const els = [
      el("sublane", "lane", "lane", 90, 0, 1300, 300),
      el("lane", "lane", "pool", 82, -58, 1362, 620),
      el("pool", "pool", undefined, 46, -58, 1398, 620),
      el("ep-big", "subprocess-expanded", "pool", 100, 100, 400, 300),
      el("ep-small", "subprocess-expanded", "pool", 120, 120, 200, 150),
    ];
    const order = orderBackdropContainers(els).map((e) => e.id);
    // pool first, then lane, then sub-lane (deeper), then EPs (rank 2), larger EP behind smaller.
    expect(order).toEqual(["pool", "lane", "sublane", "ep-big", "ep-small"]);
  });
});
