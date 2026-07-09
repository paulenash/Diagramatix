/**
 * flagIllegalTransitions marks the discovered state machine's transition
 * connectors that the conformance reference disallows (observed but not in the
 * reference) so their frequency badge renders red; clears the flag on legal ones.
 */
import { describe, it, expect } from "vitest";
import { discoverStateMachine } from "@/app/lib/mining/discoverStateMachine";
import { flagIllegalTransitions } from "@/app/lib/mining/flagIllegalTransitions";
import type { TransitionStat } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

const VARIANTS: Variant[] = [
  { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
  { events: ["Create", "Skip"], states: ["Draft", "Approved"], count: 1 }, // Draft→Approved: illegal shortcut
];

describe("flagIllegalTransitions (T0683)", () => {
  it("flags observed transitions missing from the reference, clears the rest", () => {
    const data = discoverStateMachine(VARIANTS);
    // Reference allows Draft→Pending and Pending→Approved, but NOT Draft→Approved.
    const stats: TransitionStat[] = [
      { from: "Draft", to: "Pending", observed: 5, inReference: true },
      { from: "Pending", to: "Approved", observed: 5, inReference: true },
      { from: "Draft", to: "Approved", observed: 1, inReference: false }, // illegal shortcut
    ];
    const labelOf = (id: string) => data.elements.find((e) => e.id === id)?.label ?? "";
    const flagged = flagIllegalTransitions(data, stats);

    const illegal = flagged.connectors.find((c) => labelOf(c.sourceId) === "Draft" && labelOf(c.targetId) === "Approved");
    const legal = flagged.connectors.find((c) => labelOf(c.sourceId) === "Draft" && labelOf(c.targetId) === "Pending");
    expect(illegal?.transitionIllegal).toBe(true);
    expect(legal?.transitionIllegal).toBe(false);
    // Init/final connectors (no state label) are never flagged illegal.
    const entry = flagged.connectors.find((c) => c.sourceId === "__init");
    expect(entry?.transitionIllegal).toBe(false);
  });
});
