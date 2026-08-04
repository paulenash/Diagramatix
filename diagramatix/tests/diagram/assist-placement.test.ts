/**
 * Tier-1 assist placement geometry (Paul's rules 1–4).
 */
import { describe, it, expect } from "vitest";
import {
  HALF_TASK_W, HALF_EVENT_W, placeInline, placeGatewayBranch, placeBoundaryEvent, findFreeSlot,
} from "@/app/lib/diagram/assistPlacement";
import type { DiagramElement } from "@/app/lib/diagram/types";

const box = (x: number, y: number, w: number, h: number) => ({ x, y, width: w, height: h });
const el = (id: string, x: number, y: number, w: number, h: number, extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: "intermediate-event", x, y, width: w, height: h, label: id, properties: {}, ...extra } as unknown as DiagramElement);

describe("rule 1 — inline placement", () => {
  it("puts the target's near edge 51px right of the source and aligns centres", () => {
    const source = box(100, 200, 102, 65);      // a task
    const w = 102, h = 65;
    const c = placeInline(source, w, h);
    // near (left) edge = centre.x - w/2
    expect(c.x - w / 2).toBe(source.x + source.width + HALF_TASK_W); // 202 + 51 = 253
    expect(c.y).toBe(source.y + source.height / 2);                  // vertical centres aligned
  });
});

describe("rule 2 — gateway fan-out", () => {
  const gw = box(300, 300, 40, 40);
  const w = 102, h = 65;
  it("branch 0 sits inline on the gateway centre line", () => {
    const c = placeGatewayBranch(gw, 0, w, h);
    expect(c.y).toBe(gw.y + gw.height / 2);
    expect(c.x - w / 2).toBe(gw.x + gw.width + HALF_TASK_W);
  });
  it("branches fan above then below by (h + 51), symmetric", () => {
    const mid = gw.y + gw.height / 2;
    expect(placeGatewayBranch(gw, 1, w, h).y).toBe(mid - (h + HALF_TASK_W)); // above
    expect(placeGatewayBranch(gw, 2, w, h).y).toBe(mid + (h + HALF_TASK_W)); // below
    expect(placeGatewayBranch(gw, 3, w, h).y).toBe(mid - 2 * (h + HALF_TASK_W)); // above²
    expect(placeGatewayBranch(gw, 4, w, h).y).toBe(mid + 2 * (h + HALF_TASK_W)); // below²
    // all share the same x
    expect(placeGatewayBranch(gw, 2, w, h).x).toBe(placeGatewayBranch(gw, 1, w, h).x);
  });
});

describe("rule 3 — boundary events", () => {
  const host = box(100, 100, 102, 65); // task
  const bottomY = host.y + host.height; // 165
  const topY = host.y;                  // 100
  it("1st event: bottom edge, near edge 18px from the right corner", () => {
    const c = placeBoundaryEvent(host, [])!;
    expect(c.y).toBe(bottomY);
    // right edge of event = centre.x + 18; should be 18px in from host right (202)
    expect(c.x + HALF_EVENT_W).toBe(host.x + host.width - HALF_EVENT_W); // 202 - 18 = 184
  });
  it("2nd event: top edge, near edge 18px from the top-right corner", () => {
    const first = placeBoundaryEvent(host, [])!;
    const e1 = el("e1", first.x - HALF_EVENT_W, first.y - HALF_EVENT_W, 36, 36, { boundaryHostId: "h" });
    const c = placeBoundaryEvent(host, [e1])!;
    expect(c.y).toBe(topY);
    expect(c.x + HALF_EVENT_W).toBe(host.x + host.width - HALF_EVENT_W);
  });
  it("gives up (null) when no room remains on either edge", () => {
    // Fill the bottom and top edges with events spanning the whole width.
    const many: DiagramElement[] = [];
    for (let i = 0; i < 20; i++) {
      many.push(el(`b${i}`, host.x + i * 5, host.y + host.height - 18, 36, 36, { boundaryHostId: "h" }));
      many.push(el(`t${i}`, host.x + i * 5, host.y - 18, 36, 36, { boundaryHostId: "h" }));
    }
    // leftmost event near the left corner → next would run off → null
    expect(placeBoundaryEvent(host, many)).toBeNull();
  });
});

describe("rule 4 — nearest free slot", () => {
  const w = 102, h = 65;
  it("returns the desired centre when nothing is in the way", () => {
    const c = { x: 500, y: 500 };
    expect(findFreeSlot(c, w, h, [])).toEqual(c);
  });
  it("nudges off an overlapping element and ends up ≥51px clear", () => {
    const desired = { x: 300, y: 300 };
    const blocker = box(desired.x - w / 2, desired.y - h / 2, w, h); // exactly where we want to land
    const out = findFreeSlot(desired, w, h, [blocker]);
    expect(out).not.toEqual(desired);
    // resulting box must be ≥51px clear of the blocker
    const b = { x: out.x - w / 2, y: out.y - h / 2, width: w, height: h };
    const clear =
      b.x - HALF_TASK_W >= blocker.x + blocker.width ||
      b.x + b.width + HALF_TASK_W <= blocker.x ||
      b.y - HALF_TASK_W >= blocker.y + blocker.height ||
      b.y + b.height + HALF_TASK_W <= blocker.y;
    expect(clear).toBe(true);
  });
});
