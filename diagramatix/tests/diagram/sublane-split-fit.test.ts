/**
 * T4623-T4624 — "adding 3 lanes does not work properly, but adding 2 is ok".
 *
 * Paul's observation, 21 September 2026, with the export that proved it: his
 * pool ended at y=601 while its lanes reached 642 — 41px of lane hanging out
 * of the bottom of the pool.
 *
 * TWO DEFECTS, and the second is why the first was visible.
 *
 *  1. `SPLIT_LANE_EVEN` floored each band at 28px but gave the LAST one
 *     whatever was left over. Once the floor ate the lane, the remainder went
 *     NEGATIVE and the stack ran past its parent:
 *
 *        lane 40px ÷ 2 → [28, 12]           contained
 *        lane 40px ÷ 3 → [28, 28, -16]      16px past
 *        lane 80px ÷ 4 → [28, 28, 28, -4]    4px past
 *
 *     Two is almost always safe and three often is not — exactly what he saw.
 *
 *  2. It was the ONE lane action that never called
 *     `ensureContainersEncloseChildren`, so nothing carried the growth up:
 *     the lane overflowed, and the pool stayed where it was.
 *
 * A lane asked to hold N bands needs room for N bands, so it grows; the lanes
 * below it move down by the same amount; the pool follows.
 */
import { describe, it, expect } from "vitest";
import { reducer } from "@/app/hooks/useDiagram";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";

const lane = (id: string, y: number, h: number, parentId: string): DiagramElement =>
  ({ id, type: "lane", label: id, x: 0, y, width: 800, height: h, parentId, properties: {} }) as unknown as DiagramElement;

/** A pool with a lane of `h`, and another lane below it. */
const world = (h: number): DiagramData => ({
  elements: [
    ({ id: "p", type: "pool", label: "Warehouse", x: 0, y: 0, width: 800, height: h + 100, properties: {} }) as unknown as DiagramElement,
    lane("L", 0, h, "p"),
    lane("Below", h, 100, "p"),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

const split = (h: number, n: number) =>
  reducer(world(h), {
    type: "SPLIT_LANE_EVEN",
    payload: { laneId: "L", labels: Array.from({ length: n }, (_, i) => `S${i + 1}`) },
  } as never);

describe("T4623 — a band is never negative, and never hangs out of its lane", () => {
  it("fits every count on every lane height", () => {
    for (const h of [40, 60, 80, 108, 200, 336]) {
      for (const n of [2, 3, 4, 5, 6]) {
        const r = split(h, n);
        const L = r.elements.find((e) => e.id === "L")!;
        const subs = r.elements.filter((e) => e.parentId === "L");
        expect(subs.length, `${h}/${n}`).toBe(n);
        for (const s of subs) expect(s.height, `${h}/${n} band height`).toBeGreaterThan(0);
        const bottom = Math.max(...subs.map((s) => s.y + s.height));
        expect(bottom, `${h}/${n} bands fill the lane exactly`).toBe(L.y + L.height);
        expect(Math.min(...subs.map((s) => s.y)), `${h}/${n}`).toBe(L.y);
      }
    }
  });

  it("reproduces the exact arithmetic that used to go negative", () => {
    // 40 ÷ 3 was [28, 28, -16]; 80 ÷ 4 was [28, 28, 28, -4].
    for (const [h, n] of [[40, 3], [40, 4], [60, 4], [80, 4]] as const) {
      const subs = split(h, n).elements.filter((e) => e.parentId === "L");
      expect(subs.every((s) => s.height >= 28), `${h}/${n} — every band at least the floor`).toBe(true);
    }
  });

  it("grows the lane only when it has to", () => {
    // 108 ÷ 3 = 36 each, comfortably over the floor: the lane must not move.
    const r = split(108, 3);
    expect(r.elements.find((e) => e.id === "L")!.height).toBe(108);
    // 40 ÷ 3 cannot fit at 28 each, so the lane becomes 84.
    expect(split(40, 3).elements.find((e) => e.id === "L")!.height).toBe(84);
  });
});

describe("T4624 — the growth is carried up, not left hanging", () => {
  it("moves the lane below down instead of overlapping it", () => {
    const r = split(40, 3);
    const L = r.elements.find((e) => e.id === "L")!;
    const below = r.elements.find((e) => e.id === "Below")!;
    expect(below.y, "flush against the grown lane").toBe(L.y + L.height);
    expect(below.height, "and unchanged in size").toBe(100);
  });

  it("takes the pool with it — the 41px overflow in Paul's export", () => {
    for (const [h, n] of [[40, 3], [40, 4], [60, 4], [80, 4]] as const) {
      const r = split(h, n);
      const pool = r.elements.find((e) => e.id === "p")!;
      const lanes = r.elements.filter((e) => e.parentId === "p");
      const bottom = Math.max(...lanes.map((l) => l.y + l.height));
      expect(bottom - (pool.y + pool.height), `${h}/${n} — lanes past the pool`).toBe(0);
      expect(Math.min(...lanes.map((l) => l.y)), `${h}/${n}`).toBe(pool.y);
    }
  });

  it("calls the re-fit that every other lane action already called", () => {
    // It was the one that did not, which is why the pool was left behind.
    const reducerSrc = require("node:fs").readFileSync(
      require("node:path").join(process.cwd(), "app", "hooks", "useDiagram.ts"), "utf8",
    );
    const at = reducerSrc.indexOf('case "SPLIT_LANE_EVEN"');
    const body = reducerSrc.slice(at, at + 4000);
    expect(at).toBeGreaterThan(-1);
    // The re-fit may be WRAPPED by a later rule (ensureLeftGap, 2026-09-21);
    // what this guards is that it is still in the chain at all.
    expect(body).toMatch(/ensureContainersEncloseChildren\(updatePoolTypes\(\[\.\.\.elements, \.\.\.placedNew\]\)\)/);
  });

  it("still adopts the lane's loose contents into the first band", () => {
    const s = world(200);
    (s.elements as DiagramElement[]).push(
      ({ id: "t", type: "task", label: "Pick", x: 10, y: 10, width: 90, height: 50, parentId: "L", properties: {} }) as unknown as DiagramElement,
    );
    const r = reducer(s, { type: "SPLIT_LANE_EVEN", payload: { laneId: "L", labels: ["A", "B"] } } as never);
    const t = r.elements.find((e) => e.id === "t")!;
    const first = r.elements.filter((e) => e.parentId === "L").sort((a, b) => a.y - b.y)[0];
    expect(t.parentId, "the task joins the first band, as before").toBe(first.id);
  });
});
