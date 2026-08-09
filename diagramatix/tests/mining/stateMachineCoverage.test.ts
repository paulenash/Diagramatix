/**
 * Coverage rule (Paul): a GENERATED reference state machine must show every
 * state and activity that is in the event log — otherwise conformance replays
 * the log against a partial model and drowns in false illegal transitions.
 * `reconcileStateMachineCoverage` enforces it in code on both the deterministic
 * and the AI-curated generation paths. These guards pin the rule behaviourally:
 * after reconciliation, the log conforms 100% to its own generated reference.
 */
import { describe, it, expect } from "vitest";
import { reconcileStateMachineCoverage } from "@/app/lib/mining/stateMachineCoverage";
import { buildStateMachinePlan, discoverStateMachine } from "@/app/lib/mining/discoverStateMachine";
import { checkTransitionConformance, type ReferenceSm } from "@/app/lib/mining/transitionConformance";
import type { Variant } from "@/app/lib/mining/types";

// A request lifecycle with a rare arrival-only case (arrived, never logged) — the
// kind of low-frequency behaviour AI curation is tempted to drop as "noise".
const VARIANTS: Variant[] = [
  { events: ["Request Arrived", "Log Request", "Assess Request", "Start Level 1", "Complete Level 1 Request", "Send Response"],
    states: ["Arrived", "Logged", "Assessed", "Started", "Completed", "Replied"], count: 80 },
  { events: ["Request Arrived", "Log Request"], states: ["Arrived", "Logged"], count: 15 },
  { events: ["Request Arrived"], states: ["Arrived"], count: 1 },
];

/** A plan → the subset conformance reads (synthesise a connector id per edge). */
function asReference(plan: { elements: { id: string; type: string; label: string }[]; connections: { sourceId: string; targetId: string; type: string }[] }): ReferenceSm {
  return {
    elements: plan.elements,
    connectors: plan.connections.map((c, i) => ({ id: `c${i}`, sourceId: c.sourceId, targetId: c.targetId, type: c.type })),
  };
}

describe("generated state-machine coverage rule", () => {
  it("T2247 — adds back every state, transition, entry and terminal a curated plan dropped", () => {
    // Simulate an AI curation that kept only the happy path and dropped Arrived + the drop-off variants.
    const partial = {
      elements: [
        { id: "init", type: "initial-state", label: "" },
        { id: "final", type: "final-state", label: "" },
        { id: "logged", type: "state", label: "Logged" },
        { id: "assessed", type: "state", label: "Assessed" },
        { id: "started", type: "state", label: "Started" },
        { id: "completed", type: "state", label: "Completed" },
        { id: "replied", type: "state", label: "Replied" },
      ],
      connections: [
        { sourceId: "init", targetId: "logged", label: "Log Request", type: "transition" },
        { sourceId: "logged", targetId: "assessed", label: "Assess Request", type: "transition" },
        { sourceId: "assessed", targetId: "started", label: "Start Level 1", type: "transition" },
        { sourceId: "started", targetId: "completed", label: "Complete Level 1 Request", type: "transition" },
        { sourceId: "completed", targetId: "replied", label: "Send Response", type: "transition" },
        { sourceId: "replied", targetId: "final", label: "", type: "transition" },
      ],
    };
    const fixed = reconcileStateMachineCoverage(partial, VARIANTS);

    // The dropped "Arrived" state is restored.
    const stateLabels = fixed.elements.filter((e) => e.type === "state").map((e) => e.label).sort();
    expect(stateLabels).toEqual(["Arrived", "Assessed", "Completed", "Logged", "Replied", "Started"]);

    // The restored entry (init → Arrived) and transition (Arrived → Logged) exist, labelled with the activity.
    const arrivedId = fixed.elements.find((e) => e.label === "Arrived")!.id;
    const loggedId = fixed.elements.find((e) => e.label === "Logged")!.id;
    const initId = fixed.elements.find((e) => e.type === "initial-state")!.id;
    const finalId = fixed.elements.find((e) => e.type === "final-state")!.id;
    expect(fixed.connections.some((c) => c.sourceId === initId && c.targetId === arrivedId)).toBe(true);
    expect(fixed.connections.some((c) => c.sourceId === arrivedId && c.targetId === loggedId && c.label.includes("Log Request"))).toBe(true);
    // Logged is now also a terminal (the "arrived → logged" drop-off) and Arrived a terminal (arrived-only).
    expect(fixed.connections.some((c) => c.sourceId === loggedId && c.targetId === finalId)).toBe(true);
    expect(fixed.connections.some((c) => c.sourceId === arrivedId && c.targetId === finalId)).toBe(true);
  });

  it("T2248 — after reconciliation the log conforms 100% to its own generated reference", () => {
    const partial = {
      elements: [
        { id: "init", type: "initial-state", label: "" },
        { id: "final", type: "final-state", label: "" },
        { id: "logged", type: "state", label: "Logged" },
        { id: "assessed", type: "state", label: "Assessed" },
        { id: "started", type: "state", label: "Started" },
        { id: "completed", type: "state", label: "Completed" },
        { id: "replied", type: "state", label: "Replied" },
      ],
      connections: [
        { sourceId: "init", targetId: "logged", label: "Log Request", type: "transition" },
        { sourceId: "logged", targetId: "assessed", label: "Assess Request", type: "transition" },
        { sourceId: "assessed", targetId: "started", label: "Start Level 1", type: "transition" },
        { sourceId: "started", targetId: "completed", label: "Complete Level 1 Request", type: "transition" },
        { sourceId: "completed", targetId: "replied", label: "Send Response", type: "transition" },
        { sourceId: "replied", targetId: "final", label: "", type: "transition" },
      ],
    };

    // Before: the partial reference reports illegal transitions / unknown states.
    const before = checkTransitionConformance(VARIANTS, asReference(partial));
    expect(before.fitness).toBeLessThan(1);
    expect(before.violations.some((v) => v.rule === "unknown-state" || v.rule === "undocumented-transition" || v.rule === "unexpected-entry")).toBe(true);

    // After reconciliation: clean.
    const after = checkTransitionConformance(VARIANTS, asReference(reconcileStateMachineCoverage(partial, VARIANTS)));
    expect(after.fitness).toBe(1);
    expect(after.violations.filter((v) => v.severity === "error")).toHaveLength(0);
  });

  it("T2249 — is a no-op on the already-complete deterministic discovery", () => {
    // discoverStateMachine now routes through the coverage pass; it must still conform 100%.
    const data = discoverStateMachine(VARIANTS);
    const ref: ReferenceSm = {
      elements: data.elements.map((e) => ({ id: e.id, type: e.type, label: e.label })),
      connectors: data.connectors.map((c) => ({ id: c.id, sourceId: c.sourceId, targetId: c.targetId, type: c.type })),
    };
    const result = checkTransitionConformance(VARIANTS, ref);
    expect(result.fitness).toBe(1);
    expect(result.violations.filter((v) => v.severity === "error")).toHaveLength(0);
    // The plan already contained everything, so reconcile added no duplicate states.
    const labels = data.elements.filter((e) => e.type === "state").map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
