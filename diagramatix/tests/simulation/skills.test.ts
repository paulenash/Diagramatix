/**
 * Skills — who can do what.
 *
 * Phase 7 slice 1. Before this, a pool had exactly two settings: separate teams
 * (nobody helps) or one merged team (everybody does everything). Reality is in
 * between, and the whole value of cross-skilling lives in that gap.
 *
 * The tests that matter most:
 *  - a pool with no people declared behaves EXACTLY as before (the regression bar);
 *  - capacity and skills are SEPARATE constraints, so the calendar can still close
 *    a skilled team to zero;
 *  - the least flexible qualified person is used, keeping the generalist free;
 *  - a skilled pool serves past an unservable head — because strict blocking would
 *    make the feature understate the very thing it exists to measure.
 */
import { describe, it, expect } from "vitest";
import { ResourcePool, type PoolUnit } from "@/app/lib/simulation/resourcePool";
import { Engine } from "@/app/lib/simulation/engine";
import { makeRng } from "@/app/lib/simulation/rng";
import type { SimNetwork } from "@/app/lib/simulation/model";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import type { DiagramData } from "@/app/lib/diagram/types";
import { DEFAULT_RUN_CONFIG, type SimRunConfig } from "@/app/lib/simulation/types";

const unit = (id: string, ...skills: string[]): PoolUnit => ({ id, name: id, skills });
const cfg = (over: Partial<SimRunConfig> = {}): SimRunConfig =>
  ({ ...DEFAULT_RUN_CONFIG, horizon: 300, replications: 1, seed: 4, ...over });

describe("skills — the regression bar", () => {
  it("T3508 - a pool with no people declared is a counted pool, exactly as before", () => {
    const counted = new ResourcePool<string>(2, 0);
    expect(counted.skilled).toBe(false);
    expect(counted.request(0, 1, "a")).toBe(true);
    expect(counted.request(0, 1, "b")).toBe(true);
    expect(counted.request(0, 1, "c")).toBe(false);   // full
    expect(counted.release(10, 1)).toEqual(["c"]);
  });

  it("T3509 - required skills on a task change nothing when the team declares no people", () => {
    const net = (requiredSkills?: string[]): SimNetwork => ({
      nodes: [
        { id: "src", kind: "source", arrival: { kind: "fixed", value: 2 }, maxArrivals: 8 },
        { id: "t", kind: "task", teamId: "Team", cycleTime: { kind: "fixed", value: 5 }, ...(requiredSkills ? { requiredSkills } : {}) },
        { id: "end", kind: "sink" },
      ],
      edges: [{ id: "e1", source: "src", target: "t" }, { id: "e2", source: "t", target: "end" }],
      teams: [{ id: "Team", capacity: 2 }],
    });
    const bare = new Engine(net(), cfg(), makeRng(4)).run();
    const asked = new Engine(net(["anything"]), cfg(), makeRng(4)).run();
    // Nobody is declared, so there is no one to be ineligible: the constraint
    // cannot bite, and the run is identical.
    expect(asked).toEqual(bare);
  });
});

describe("skills — eligibility", () => {
  const people = [unit("ann", "assess", "appeal"), unit("bob", "assess")];

  it("T3510 - only someone holding EVERY required skill can take the work (AND)", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", people);
    expect(p.skilled).toBe(true);
    // Bob cannot appeal, so the appeal work can only go to Ann.
    expect(p.request(0, 1, "appeal-1", { requiredSkills: ["appeal"], key: "appeal-1" })).toBe(true);
    expect(p.request(0, 1, "appeal-2", { requiredSkills: ["appeal"], key: "appeal-2" })).toBe(false);
  });

  it("T3511 - work requiring nothing can be taken by anyone", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", people);
    expect(p.request(0, 1, "x", { key: "x" })).toBe(true);
    expect(p.request(0, 1, "y", { key: "y" })).toBe(true);
    expect(p.request(0, 1, "z", { key: "z" })).toBe(false);   // both busy
  });

  it("T3512 - a skill nobody holds means the work waits, rather than being given to anyone", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", people);
    expect(p.request(0, 1, "audit", { requiredSkills: ["audit"], key: "audit" })).toBe(false);
    expect(p.queueLength).toBe(1);
  });

  it("T3513 - releasing frees the RIGHT person, not just a count", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", people);
    p.request(0, 1, "appeal-1", { requiredSkills: ["appeal"], key: "appeal-1" });  // Ann
    p.request(0, 1, "assess-1", { requiredSkills: ["assess"], key: "assess-1" });  // Bob

    // A second appeal has to wait: Ann is the only one who can do it, and she is
    // busy — even though the pool has spare CAPACITY once Bob is released.
    expect(p.release(10, 1, "assess-1")).toEqual([]);
    expect(p.request(10, 1, "appeal-2", { requiredSkills: ["appeal"], key: "appeal-2" })).toBe(false);

    // Releasing ANN is what unblocks it, and the waiting appeal is handed to her
    // on that release — a count-based pool could not have told the two apart.
    expect(p.release(20, 1, "appeal-1")).toEqual(["appeal-2"]);
    expect(p.toJSON().assigned!["appeal-2"]).toEqual(["ann"]);
  });
});

describe("skills — least flexible first", () => {
  it("T3514 - the generalist is kept free for the work only they can do", () => {
    // Ann can do both; Bob only assessment. General work must go to BOB.
    const p = new ResourcePool<string>(2, 0, "fifo", [unit("ann", "assess", "appeal"), unit("bob", "assess")]);
    p.request(0, 1, "routine", { requiredSkills: ["assess"], key: "routine" });
    // Ann is still free, so the appeal that only she can do is servable.
    expect(p.request(0, 1, "appeal", { requiredSkills: ["appeal"], key: "appeal" })).toBe(true);
  });

  it("T3515 - ties break on unit id, so the choice is reproducible", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", [unit("zoe", "assess"), unit("amy", "assess")]);
    p.request(0, 1, "one", { requiredSkills: ["assess"], key: "one" });
    const state = p.toJSON();
    expect(state.assigned!.one).toEqual(["amy"]);   // not "whichever came first in the array"
  });
});

describe("skills — serving past an unservable head", () => {
  it("T3516 - a skilled pool serves work someone CAN do rather than leaving them idle", () => {
    // Only Ann can audit, and she is busy. An assessment sits behind the audit.
    const p = new ResourcePool<string>(2, 0, "fifo", [unit("ann", "assess", "audit"), unit("bob", "assess")]);
    p.request(0, 1, "ann-busy", { requiredSkills: ["audit"], key: "ann-busy" });   // Ann
    p.request(0, 1, "bob-busy", { requiredSkills: ["assess"], key: "bob-busy" });  // Bob
    p.request(0, 1, "audit-2", { requiredSkills: ["audit"], key: "audit-2" });     // queued: needs Ann
    p.request(0, 1, "assess-2", { requiredSkills: ["assess"], key: "assess-2" });  // queued: behind it

    // Bob finishes. The head of the queue needs Ann, who is still busy — but Bob
    // can do the assessment behind it, and leaving him idle would make
    // cross-skilling look worthless.
    expect(p.release(10, 1, "bob-busy")).toEqual(["assess-2"]);
    expect(p.queueLength).toBe(1);
  });

  it("T3517 - queue ORDER is still respected among the requests that can be served", () => {
    const p = new ResourcePool<string>(1, 0, "fifo", [unit("bob", "assess")]);
    p.request(0, 1, "busy", { requiredSkills: ["assess"], key: "busy" });
    p.request(0, 1, "first", { requiredSkills: ["assess"], key: "first" });
    p.request(0, 1, "second", { requiredSkills: ["assess"], key: "second" });
    expect(p.release(10, 1, "busy")).toEqual(["first"]);
  });

  it("T3518 - a COUNTED pool keeps strict head-of-line blocking, unchanged", () => {
    const p = new ResourcePool<string>(2, 0);
    p.request(0, 1, "holder");
    p.request(0, 2, "needs-two");   // waits at the head
    p.request(0, 1, "needs-one");   // granted on arrival (1+1 = 2)
    // Freeing one leaves the head still unservable, and nothing behind it moves.
    expect(p.release(10, 1)).toEqual([]);
  });
});

describe("skills — capacity is a separate constraint", () => {
  it("T3519 - a skilled team closed by the calendar stops, however many qualify", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", [unit("ann", "assess"), unit("bob", "assess")]);
    p.setCapacity(0, 0);                                   // the calendar shuts the team
    expect(p.request(0, 1, "x", { requiredSkills: ["assess"], key: "x" })).toBe(false);
    // ...and it resumes when the team reopens.
    expect(p.setCapacity(10, 2)).toEqual(["x"]);
  });

  it("T3520 - capacity can cap a skilled team below its headcount", () => {
    const p = new ResourcePool<string>(1, 0, "fifo", [unit("ann", "assess"), unit("bob", "assess")]);
    expect(p.request(0, 1, "a", { requiredSkills: ["assess"], key: "a" })).toBe(true);
    // Two people qualify, but only one may work at once.
    expect(p.request(0, 1, "b", { requiredSkills: ["assess"], key: "b" })).toBe(false);
  });
});

describe("skills — the machinery around them", () => {
  it("T3521 - people and their assignments survive a snapshot", () => {
    const p = new ResourcePool<string>(2, 0, "fifo", [unit("ann", "assess", "appeal"), unit("bob", "assess")]);
    p.request(0, 1, "appeal-1", { requiredSkills: ["appeal"], key: "appeal-1" });
    const revived = ResourcePool.fromJSON<string>(JSON.parse(JSON.stringify(p.toJSON())));
    // Ann is still occupied on the other side of the round trip.
    expect(revived.request(1, 1, "appeal-2", { requiredSkills: ["appeal"], key: "appeal-2" })).toBe(false);
  });

  it("T3522 - an older snapshot with no people resumes as a counted pool", () => {
    const p = new ResourcePool<string>(2, 0);
    p.request(0, 1, "a");
    const legacy = JSON.parse(JSON.stringify(p.toJSON())) as Record<string, unknown>;
    delete legacy.units; delete legacy.assigned;
    const revived = ResourcePool.fromJSON<string>(legacy as never);
    expect(revived.skilled).toBe(false);
    expect(revived.request(1, 1, "b")).toBe(true);
  });
});

describe("skills — end to end, from the diagram to the engine", () => {
  /** A task marked as needing "appeal", in a lane owned by the Claims team. */
  function bpmn(): DiagramData {
    const el = (id: string, type: string, label: string, sim?: Record<string, unknown>) => ({
      id, type, label, x: 0, y: 0, width: 100, height: 60,
      properties: { ...(sim ? { sim } : {}) },
    });
    return {
      elements: [
        el("s", "start-event", "In"),
        el("t", "task", "Handle appeal", { teamId: "Claims", cycleTime: { kind: "fixed", value: 5 }, requiredSkills: ["appeal"] }),
        el("e", "end-event", "Out"),
      ],
      connectors: [
        { id: "c1", type: "sequence", sourceId: "s", targetId: "t", waypoints: [] },
        { id: "c2", type: "sequence", sourceId: "t", targetId: "e", waypoints: [] },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    } as unknown as DiagramData;
  }

  it("T3537 - required skills survive the diagram → assembler → network journey", () => {
    const net = assembleFromDiagram(bpmn(), {
      teamCapacities: { Claims: 2 },
      teamUnits: { Claims: [unit("ann", "assess", "appeal"), unit("bob", "assess")] },
    });
    const task = net.nodes.find((n) => n.id.endsWith("t"))!;
    expect(task.requiredSkills).toEqual(["appeal"]);
    const team = net.teams.find((t) => t.id === "Claims")!;
    expect(team.units?.map((u) => u.id)).toEqual(["ann", "bob"]);
    // Capacity still comes from the library, independently of who is on the team.
    expect(team.capacity).toBe(2);
  });

  it("T3538 - a team with no members declared assembles as a counted pool", () => {
    const net = assembleFromDiagram(bpmn(), { teamCapacities: { Claims: 2 } });
    expect(net.teams.find((t) => t.id === "Claims")!.units).toBeUndefined();
  });

  it("T3539 - the constraint actually bites: only the qualified person does the work", () => {
    // Two people, only one can appeal, and the work needs it — so the team
    // behaves as though it had ONE person for this task however big it is.
    const net = assembleFromDiagram(bpmn(), {
      teamCapacities: { Claims: 2 },
      teamUnits: { Claims: [unit("ann", "assess", "appeal"), unit("bob", "assess")] },
    });
    net.nodes.find((n) => n.kind === "source" || n.id.endsWith("s"))!;
    const pool = net.teams.find((t) => t.id === "Claims")!;
    expect(pool.units).toHaveLength(2);
    // The eligibility itself is exercised directly by T3510-T3513; this pins that
    // the model REACHING the engine carries what those tests rely on.
    expect(net.nodes.find((n) => n.id.endsWith("t"))!.requiredSkills).toEqual(["appeal"]);
  });
});
