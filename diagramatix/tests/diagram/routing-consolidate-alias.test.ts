/**
 * ENG-13 — `consolidateWaypoints` must never hand back the caller's own array.
 * A short path (≤4 points) used to be returned by reference, so a later in-place
 * edit of the result would silently mutate the shared input.
 */
import { describe, it, expect } from "vitest";
import { consolidateWaypoints } from "@/app/lib/diagram/routing";

describe("consolidateWaypoints — no input aliasing (ENG-13)", () => {
  it("returns a fresh array for a short path", () => {
    const input = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    const out = consolidateWaypoints(input);
    expect(out).not.toBe(input); // different array identity
    expect(out).toEqual(input); // same contents
    // Mutating the result must not reach back into the caller's array.
    out.push({ x: 99, y: 99 });
    expect(input).toHaveLength(3);
  });
});
