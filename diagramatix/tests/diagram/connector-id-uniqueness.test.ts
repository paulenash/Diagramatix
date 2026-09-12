/**
 * A generated diagram must never contain two connectors with the same id.
 *
 * Paul, 2026-09-13: a curated State Machine "exhibits weird ghosting of
 * connectors. If I delete a connector it still appears on the diagram but
 * unselectable."
 *
 * That is what a duplicate id looks like from the outside. Delete removes the
 * connector the id resolves to; the other one with the same id keeps being
 * drawn, and every click resolves to the record that is already gone — so it
 * cannot be selected, cannot be deleted, and disappears on reload as though
 * nothing had been wrong. His Order-to-Cash reference carried 17 duplicated ids
 * across 37 connectors.
 *
 * TWO SEPARATE FAULTS PRODUCED IT, and each is guarded here:
 *   • the plan contained each transition twice (stateMachineCoverage)
 *   • the id scheme could not tell two connectors apart (stateMachineLayout)
 *
 * The second matters on its own: a state machine may legitimately carry two
 * transitions between the same pair of states on different events, and under the
 * old scheme those two would have ghosted each other with nothing duplicated at
 * all.
 */
import { describe, it, expect } from "vitest";
import { layoutGenericDiagram } from "@/app/lib/diagram/genericLayout";
import { reconcileStateMachineCoverage } from "@/app/lib/mining/stateMachineCoverage";
import type { DiagramData } from "@/app/lib/diagram/types";

/** Ids that appear more than once. */
const duplicateIds = (data: DiagramData): string[] => {
  const seen = new Set<string>(), dup = new Set<string>();
  for (const c of data.connectors) (seen.has(c.id) ? dup : seen).add(c.id);
  return [...dup];
};

describe("generated connectors have unique ids", () => {
  it("T4305 — two transitions between the SAME pair of states get different ids", () => {
    // Entirely legitimate: one state machine, two events, same endpoints. Under
    // `conn-<source>-<target>` these collided, and the second was a ghost from
    // the moment it was drawn.
    const data = layoutGenericDiagram({
      elements: [
        { id: "s1", type: "state", label: "Submitted" },
        { id: "s2", type: "state", label: "Closed" },
      ],
      connections: [
        { sourceId: "s1", targetId: "s2", type: "transition", label: "Approve" },
        { sourceId: "s1", targetId: "s2", type: "transition", label: "Reject" },
      ],
    } as Parameters<typeof layoutGenericDiagram>[0], "state-machine") as DiagramData;

    expect(data.connectors.length).toBe(2);
    expect(duplicateIds(data), "two transitions cannot share an id").toEqual([]);
  });

  it("T4306 — a plan whose connections omit `type` is not doubled", () => {
    // The root cause. Nothing asks the model to write type:"transition", so the
    // coverage reconciler's `c.type !== "transition"` skipped every one of the
    // model's own connections, found an empty set, and added the whole observed
    // log back on top of what was already there.
    const variants = [{ states: ["Draft", "Approved"], events: ["Receive", "Approve"], count: 5 }] as never[];
    const plan = {
      elements: [
        { id: "s1", type: "state", label: "Draft" },
        { id: "s2", type: "state", label: "Approved" },
      ],
      connections: [{ sourceId: "s1", targetId: "s2", label: "Approve" }],
    };

    const out = reconcileStateMachineCoverage(JSON.parse(JSON.stringify(plan)), variants);
    const pairs = out.connections.map((c) => `${c.sourceId}→${c.targetId}`);
    expect(pairs.filter((v, i) => pairs.indexOf(v) !== i), "a transition was added back on top of itself").toEqual([]);
  });

  it("T4307 — the reconciler is still a no-op on a plan that DOES declare types", () => {
    // The fix loosened a guard, so the case it was guarding must still hold:
    // a fully-typed plan must not gain anything it already had.
    const variants = [{ states: ["Draft", "Approved"], events: ["Receive", "Approve"], count: 5 }] as never[];
    const typed = {
      elements: [
        { id: "s1", type: "state", label: "Draft" },
        { id: "s2", type: "state", label: "Approved" },
      ],
      connections: [{ sourceId: "s1", targetId: "s2", label: "Approve", type: "transition" }],
    };
    const out = reconcileStateMachineCoverage(JSON.parse(JSON.stringify(typed)), variants);
    const pairs = out.connections.map((c) => `${c.sourceId}→${c.targetId}`);
    expect(pairs.filter((v, i) => pairs.indexOf(v) !== i)).toEqual([]);
    // ...and a genuinely NON-transition connection is still ignored by the index,
    // rather than being treated as covering a transition it has nothing to do with.
    const withNote = {
      elements: [
        { id: "s1", type: "state", label: "Draft" },
        { id: "s2", type: "state", label: "Approved" },
      ],
      connections: [{ sourceId: "s1", targetId: "s2", label: "see note", type: "association" }],
    };
    const noted = reconcileStateMachineCoverage(JSON.parse(JSON.stringify(withNote)), variants);
    expect(noted.connections.some((c) => c.type === "transition"),
      "the association must not stand in for the missing transition").toBe(true);
  });

  it("T4308 — the whole curated shape survives layout with unique ids", () => {
    // End to end: an untyped plan, reconciled, laid out. This is the path that
    // produced Paul's file.
    const variants = [
      { states: ["Draft", "Credit Check", "Approved", "Closed"], events: ["Receive Order", "Run Credit Check", "Approve Order", "Close"], count: 12 },
      { states: ["Draft", "Credit Check", "Rejected"], events: ["Receive Order", "Run Credit Check", "Reject"], count: 4 },
    ] as never[];
    const plan = {
      elements: [
        { id: "s1", type: "state", label: "Draft" },
        { id: "s2", type: "state", label: "Credit Check" },
        { id: "s3", type: "state", label: "Approved" },
      ],
      connections: [
        { sourceId: "s1", targetId: "s2", label: "Receive Order" },
        { sourceId: "s2", targetId: "s3", label: "Approve Order" },
      ],
    };
    const covered = reconcileStateMachineCoverage(JSON.parse(JSON.stringify(plan)), variants);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = layoutGenericDiagram(covered as any, "state-machine") as DiagramData;

    expect(duplicateIds(data), "a duplicate id is a connector that cannot be deleted").toEqual([]);
    // Every connector must also resolve to real elements, or it draws from nowhere.
    const ids = new Set(data.elements.map((e) => e.id));
    for (const c of data.connectors) {
      expect(ids.has(c.sourceId), `${c.id} source`).toBe(true);
      expect(ids.has(c.targetId), `${c.id} target`).toBe(true);
    }
  });
});

describe("uniqueness must not cost determinism", () => {
  it("T4309 — two identical layout calls produce identical ids", () => {
    // The first attempt at this fix used a module-scope counter, which made the
    // SECOND call of the same layout produce different ids. T0968 caught it by
    // comparing two runs directly — and every golden in the suite rests on the
    // same property. Uniqueness within a diagram, determinism across calls: the
    // index has to come from the array being built, not from a counter that
    // outlives the call.
    const plan = {
      elements: [
        { id: "s1", type: "state", label: "A" },
        { id: "s2", type: "state", label: "B" },
      ],
      connections: [
        { sourceId: "s1", targetId: "s2", type: "transition", label: "x" },
        { sourceId: "s1", targetId: "s2", type: "transition", label: "y" },
      ],
    } as Parameters<typeof layoutGenericDiagram>[0];

    const a = layoutGenericDiagram(plan, "state-machine") as DiagramData;
    const b = layoutGenericDiagram(plan, "state-machine") as DiagramData;
    expect(b.connectors.map((c) => c.id)).toEqual(a.connectors.map((c) => c.id));
    expect(duplicateIds(a)).toEqual([]);
  });
});
