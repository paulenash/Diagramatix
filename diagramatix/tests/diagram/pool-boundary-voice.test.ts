/**
 * T4644–T4646 — speaking to one edge of a pool.
 *
 * Paul, 21 September 2026, as soon as the left boundary could be dragged again:
 *
 *   "New Voice Assist commands, if not already implemented:
 *    {Move, Nudge} Pool {left, right, top, bottom} boundary {left, right, up,
 *    down}"
 *
 * The hard part is that both halves name a side. "Move the pool's left
 * boundary right" ends in a direction word exactly as "move the pool right"
 * does, and the existing whole-pool nudge rule would have swallowed it and
 * slid the entire pool — the opposite of the request. So the boundary phrase
 * is tried first.
 *
 * And the pairings have to be refused, not guessed: a LEFT edge is a vertical
 * line and can only slide sideways. "Move the left boundary up" is not a near
 * miss, it is two different gestures.
 *
 * The geometry deliberately goes through the same RESIZE_ELEMENT the mouse
 * uses, so a spoken boundary move obeys every rule a dragged one does — stops
 * at the content, carries the lanes, keeps the pool its lane stack.
 */
import { describe, it, expect } from "vitest";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { validateOps } from "@/app/lib/assist/ops";
import { parsePoolBoundaryPhrase, boundaryTakesDirection, boundaryRect } from "@/app/lib/assist/poolBoundaryPhrase";

describe("T4644 — the sentence is heard as a boundary move", () => {
  it("takes every combination Paul named", () => {
    for (const verb of ["move", "nudge"]) {
      for (const [boundary, dirs] of [
        ["left", ["left", "right"]], ["right", ["left", "right"]],
        ["top", ["up", "down"]], ["bottom", ["up", "down"]],
      ] as const) {
        for (const direction of dirs) {
          const ops = parseCommand(`${verb} the pool ${boundary} boundary ${direction}`);
          expect(ops, `${verb} ${boundary} → ${direction}`).toEqual([
            { op: "movePoolBoundary", boundary, direction },
          ]);
        }
      }
    }
  });

  it("takes a named pool, a possessive, and a distance", () => {
    expect(parseCommand("move the Warehouse pool's left boundary right by 40")).toEqual([
      { op: "movePoolBoundary", ref: "Warehouse", boundary: "left", direction: "right", distance: 40 },
    ]);
    expect(parseCommand("nudge the bottom edge of the Customer pool down")).toEqual([
      { op: "movePoolBoundary", ref: "Customer", boundary: "bottom", direction: "down" },
    ]);
  });

  it("is not mistaken for sliding the whole pool", () => {
    // The bug this ordering exists to prevent: both sentences end in a
    // direction, and the whole-pool nudge rule matches the shorter one.
    expect(parseCommand("move the pool right")).toEqual([
      { op: "nudgePool", direction: "right" },
    ]);
    expect(parseCommand("move the pool's right boundary right")).toEqual([
      { op: "movePoolBoundary", boundary: "right", direction: "right" },
    ]);
  });

  it("accepts the words people actually use for an edge", () => {
    for (const phrase of [
      "move the pool left-hand boundary right",
      "shift the pool upper edge down",
      "drag the pool lower border up",
    ]) {
      expect(parseCommand(phrase)?.[0]?.op, phrase).toBe("movePoolBoundary");
    }
  });
});

describe("T4645 — an impossible pairing is refused, not guessed", () => {
  it("knows which way each edge can travel", () => {
    expect(boundaryTakesDirection("left", "right")).toBe(true);
    expect(boundaryTakesDirection("left", "up")).toBe(false);
    expect(boundaryTakesDirection("top", "down")).toBe(true);
    expect(boundaryTakesDirection("bottom", "left")).toBe(false);
  });

  it("hands a nonsense pairing to the AI rather than acting on it", () => {
    for (const phrase of [
      "move the pool left boundary up",
      "move the pool top boundary right",
      "nudge the pool bottom boundary left",
    ]) {
      expect(parsePoolBoundaryPhrase(phrase), phrase).toBeNull();
      // parseCommand may still find another reading, but never this op.
      expect(parseCommand(phrase)?.[0]?.op, phrase).not.toBe("movePoolBoundary");
    }
  });

  it("refuses the same pairing coming back from the AI", () => {
    expect(validateOps([{ op: "movePoolBoundary", boundary: "left", direction: "up" }])).toEqual([]);
    expect(validateOps([{ op: "movePoolBoundary", boundary: "nowhere", direction: "up" }])).toEqual([]);
    expect(validateOps([{ op: "movePoolBoundary", boundary: "top", direction: "down", distance: 40 }]))
      .toEqual([{ op: "movePoolBoundary", boundary: "top", direction: "down", distance: 40 }]);
  });

  it("leaves out the words that would mean two things", () => {
    // "outward" / "inward" reverse meaning between opposite edges, so they are
    // not direction words. The sentence names an edge and no way to move it,
    // which is the "needs-direction" case — declined either way, and never
    // acted on.
    expect(parsePoolBoundaryPhrase("move the pool left boundary outward")).toBe("needs-direction");
    expect(parseCommand("move the pool left boundary outward")).toBeNull();
  });
});

describe("T4646 — the rect it asks the reducer for", () => {
  const pool = { x: 100, y: 50, width: 400, height: 200 };

  it("moves the named edge and leaves the opposite one alone", () => {
    expect(boundaryRect(pool, "left", "right", 30)).toEqual({ x: 130, y: 50, width: 370, height: 200 });
    expect(boundaryRect(pool, "left", "left", 30)).toEqual({ x: 70, y: 50, width: 430, height: 200 });
    expect(boundaryRect(pool, "right", "right", 30)).toEqual({ x: 100, y: 50, width: 430, height: 200 });
    expect(boundaryRect(pool, "top", "up", 30)).toEqual({ x: 100, y: 20, width: 400, height: 230 });
    expect(boundaryRect(pool, "bottom", "up", 30)).toEqual({ x: 100, y: 50, width: 400, height: 170 });
  });

  it("keeps the far edge fixed whichever way it goes", () => {
    for (const dir of ["left", "right"] as const) {
      const r = boundaryRect(pool, "left", dir, 25);
      expect(r.x + r.width, `left ${dir}`).toBe(pool.x + pool.width);
    }
    for (const dir of ["up", "down"] as const) {
      const r = boundaryRect(pool, "bottom", dir, 25);
      expect(r.y, `bottom ${dir}`).toBe(pool.y);
    }
  });
});
