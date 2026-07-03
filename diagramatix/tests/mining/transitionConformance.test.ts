/**
 * State-change conformance: replay mined variants over a reference state machine
 * and flag deviations (undocumented transitions, unknown states, unexpected
 * entry/exit, dead reference transitions) + a fitness %. The governance heart of
 * Process Mining.
 */
import { describe, it, expect } from "vitest";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

// Reference: Draft →Submit→ Pending →Approve→ Approved (final). Rejection is NOT
// a documented path.
const REF: ReferenceSm = {
  elements: [
    { id: "init", type: "initial-state", label: "" },
    { id: "fin", type: "final-state", label: "" },
    { id: "s_draft", type: "state", label: "Draft" },
    { id: "s_pending", type: "state", label: "Pending" },
    { id: "s_approved", type: "state", label: "Approved" },
  ],
  connectors: [
    { id: "c_init", sourceId: "init", targetId: "s_draft", type: "transition" },
    { id: "c_dp", sourceId: "s_draft", targetId: "s_pending", type: "transition" },
    { id: "c_pa", sourceId: "s_pending", targetId: "s_approved", type: "transition" },
    { id: "c_fin", sourceId: "s_approved", targetId: "fin", type: "transition" },
  ],
};

// 5 conforming cases, 2 deviating (they hit an undocumented "Rejected" state).
const VARIANTS: Variant[] = [
  { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
  { events: ["Create", "Submit", "Reject"], states: ["Draft", "Pending", "Rejected"], count: 2 },
];

describe("state-change conformance", () => {
  it("T0596 — fitness is the frequency-weighted fraction of cleanly-replaying cases", () => {
    const r = checkTransitionConformance(VARIANTS, REF);
    expect(r.totalCases).toBe(7);
    expect(r.conformingCases).toBe(5);
    expect(r.fitness).toBeCloseTo(5 / 7, 5);
  });

  it("T0597 — flags the undocumented transition + unknown state + unexpected exit", () => {
    const r = checkTransitionConformance(VARIANTS, REF);
    const rule = (name: string) => r.violations.find((v) => v.rule === name);
    expect(rule("undocumented-transition")?.data).toMatchObject({ from: "Pending", to: "Rejected" });
    expect(rule("undocumented-transition")?.cases).toBe(2);
    expect(rule("unknown-state")?.data).toMatchObject({ state: "Rejected" });
    expect(rule("unexpected-exit")?.data).toMatchObject({ state: "Rejected" });
  });

  it("T0598 — a fully-conforming log scores 100% with no violations + no dead transitions", () => {
    const clean = checkTransitionConformance([VARIANTS[0]], REF); // only the Approve path
    expect(clean.fitness).toBe(1);
    expect(clean.violations).toEqual([]);   // every ref transition was observed → no dead ones either
  });

  it("T0599 — a reference transition never seen in the log is flagged as dead", () => {
    // Log only ever does Draft→Pending; Pending→Approved is never exercised.
    const partial: Variant[] = [{ events: ["Create", "Submit"], states: ["Draft", "Pending"], count: 3 }];
    const r = checkTransitionConformance(partial, REF);
    const dead = r.violations.filter((v) => v.rule === "dead-transition");
    expect(dead.some((v) => v.data?.from === "Pending" && v.data?.to === "Approved")).toBe(true);
    expect(dead[0].ids).toContain("c_pa");   // carries the ref connector id for the overlay
  });
});
