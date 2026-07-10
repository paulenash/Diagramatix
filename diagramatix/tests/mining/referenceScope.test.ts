/**
 * Reference-picker scoping: a conformance reference must describe the SAME
 * entity's lifecycle, so it's kept only when its states overlap the run's. This
 * excludes cross-entity state machines (an OCEL "Order" run must not offer the
 * "Item" machine) and, in the route, the run's own discovered mirror.
 */
import { describe, it, expect } from "vitest";
import { isRelevantReference, runStates } from "@/app/lib/mining/referenceScope";

describe("reference scoping (T0695)", () => {
  it("runStates collects the distinct observed states", () => {
    expect(runStates([{ states: ["Placed", "Shipped"] }, { states: ["Placed", "Cancelled"] }]).sort())
      .toEqual(["Cancelled", "Placed", "Shipped"]);
  });

  it("keeps a same-entity reference, drops another entity's state machine", () => {
    const order = ["Placed", "Confirmed", "Shipped", "Delivered"];
    expect(isRelevantReference(["Placed", "Confirmed", "Shipped"], order)).toBe(true);   // 3/4 overlap
    expect(isRelevantReference(["Ordered", "Picked", "Packed"], order)).toBe(false);       // item states → excluded
    expect(isRelevantReference(["placed", "shipped"], order)).toBe(true);                  // case-insensitive, 2/4 = 50%
    expect(isRelevantReference(["Placed"], order)).toBe(false);                            // 1/4 < 50%
  });

  it("allows any state machine when the run has no states to judge by", () => {
    expect(isRelevantReference(["Anything"], [])).toBe(true);
  });
});
