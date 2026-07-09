/**
 * State-machine discovery: the log's state sequences → a candidate UML state
 * machine (states + event-labelled transitions + initial/final), the same data
 * shape a hand-drawn reference uses. Guards the transition extraction, event
 * labelling, and that the laid-out diagram is editor-valid.
 */
import { describe, it, expect } from "vitest";
import { buildStateMachinePlan, discoverStateMachine } from "@/app/lib/mining/discoverStateMachine";
import type { Variant } from "@/app/lib/mining/types";

const BRANCHING: Variant[] = [
  { events: ["Create", "Submit", "Approve"], states: ["Draft", "Pending", "Approved"], count: 5 },
  { events: ["Create", "Submit", "Reject"], states: ["Draft", "Pending", "Rejected"], count: 2 },
];

describe("state-machine discovery", () => {
  it("T0593 — extracts distinct states + event-labelled transitions with counts", () => {
    const plan = buildStateMachinePlan(BRANCHING);
    // 4 states + initial + final.
    expect(plan.elements.filter((e) => e.type === "state").map((e) => e.label).sort()).toEqual(["Approved", "Draft", "Pending", "Rejected"]);
    expect(plan.elements.filter((e) => e.type === "initial-state")).toHaveLength(1);
    expect(plan.elements.filter((e) => e.type === "final-state")).toHaveLength(1);
    // Transitions carry the triggering activity + frequency.
    const dp = plan.transitions.find((t) => t.from === "Draft" && t.to === "Pending")!;
    expect(dp.events).toEqual(["Submit"]);
    expect(dp.count).toBe(7);
    expect(plan.transitions.find((t) => t.from === "Pending" && t.to === "Approved")!.count).toBe(5);
    expect(plan.transitions.find((t) => t.from === "Pending" && t.to === "Rejected")!.count).toBe(2);
  });

  it("T0594 — the entry transition is labelled with the creating event; terminals reach Final", () => {
    const plan = buildStateMachinePlan(BRANCHING);
    const entry = plan.connections.find((c) => c.sourceId === "__init")!;
    expect(entry.label).toBe("Create");
    // Approved + Rejected both flow to the final state.
    const toFinal = plan.connections.filter((c) => c.targetId === "__final");
    expect(toFinal).toHaveLength(2);
  });

  it("T0595 — discoverStateMachine lays out an editor-valid diagram with formal transitions", () => {
    const data = discoverStateMachine(BRANCHING);
    expect(data.elements.length).toBeGreaterThan(0);
    expect(data.connectors.length).toBeGreaterThan(0);
    for (const c of data.connectors) {
      expect(Array.isArray(c.waypoints)).toBe(true);
      expect(c.sourceSide && c.targetSide).toBeTruthy();
      expect(c.type).toBe("transition");
    }
    // The Draft→Pending transition carries its event as formal data.
    const labelled = data.connectors.find((c) => c.transitionEvent === "Submit");
    expect(labelled?.labelMode).toBe("formal");
  });

  it("T0682 — every connector carries its case-count frequency (green badge)", () => {
    const data = discoverStateMachine(BRANCHING);
    // Draft→Pending took 7 cases; Pending→Approved 5; Pending→Rejected 2.
    const submit = data.connectors.find((c) => c.transitionEvent === "Submit")!;
    expect(submit.transitionCount).toBe(7);
    // Entry (init→Draft) = 7 cases; terminals carry their case counts too.
    const entry = data.connectors.find((c) => c.sourceId === "__init")!;
    expect(entry.transitionCount).toBe(7);
    const toFinal = data.connectors.filter((c) => c.targetId === "__final");
    expect(toFinal.reduce((a, c) => a + (c.transitionCount ?? 0), 0)).toBe(7); // 5 approved + 2 rejected
    // Every transition connector has a count.
    expect(data.connectors.every((c) => typeof c.transitionCount === "number")).toBe(true);
  });
});
