/**
 * The AI state-machine path serialises the mined lifecycle into a prompt for the
 * shared AI Generate pipeline. Only that serialisation is pure/unit-testable (the
 * model call itself needs a live key). This pins that the brief faithfully
 * carries the observed states, entry, frequency-weighted transitions with their
 * triggering activities, and terminal states — the raw material the model curates.
 */
import { describe, it, expect } from "vitest";
import { describeMinedLifecycle } from "@/app/lib/mining/aiStateMachine";
import type { Variant } from "@/app/lib/mining/types";

const VARIANTS: Variant[] = [
  { states: ["Draft", "Pending", "Approved"], events: ["Create", "Submit", "Approve"], count: 5 },
  { states: ["Draft", "Pending", "Rejected"], events: ["Create", "Submit", "Reject"], count: 2 },
];

describe("AI state-machine prompt serialisation", () => {
  it("T0609 — the brief carries states, entry, weighted transitions + terminals", () => {
    const t = describeMinedLifecycle(VARIANTS);
    expect(t).toContain("7 cases");                              // 5 + 2 total
    expect(t).toContain("States observed: Approved, Draft, Pending, Rejected");
    expect(t).toContain("(start) → Draft  [Create]  ×7");       // shared entry
    expect(t).toContain("Draft → Pending  [Submit]  ×7");        // shared transition, summed
    expect(t).toContain("Pending → Approved  [Approve]  ×5");
    expect(t).toContain("Pending → Rejected  [Reject]  ×2");
    expect(t).toContain("Approved  ×5");                         // terminals
    expect(t).toContain("Rejected  ×2");
    expect(t).toMatch(/REFERENCE state machine/i);              // the curation instruction
  });

  it("T0610 — respects the stats state list ordering when provided", () => {
    const t = describeMinedLifecycle(VARIANTS, { states: ["Draft", "Pending", "Approved", "Rejected"] });
    expect(t).toContain("States observed: Draft, Pending, Approved, Rejected");
  });
});
