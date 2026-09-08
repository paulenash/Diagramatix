/**
 * Reading the skills matrix out of an ArchiMate diagram.
 *
 * Phase 7 slice 2. Business Architects already model this and already model it in
 * ArchiMate, so the Simulator reads it rather than asking for it a second time.
 *
 * The tests that matter most are the ones about what does NOT match. Silent
 * non-matching is this feature's failure mode — a fill that quietly does nothing
 * looks exactly like a fill that worked — and it is the same lesson the calendar
 * exceptions taught in Phase 5.
 */
import { describe, it, expect } from "vitest";
import { skillsFromArchimate, matchSkills, normaliseLabel } from "@/app/lib/simulation/skillsFromArchimate";
import type { DiagramData } from "@/app/lib/diagram/types";

const el = (id: string, type: string, label: string) => ({
  id, type, label, x: 0, y: 0, width: 100, height: 60, properties: {},
});
const conn = (id: string, type: string, sourceId: string, targetId: string) => ({
  id, type, sourceId, targetId, waypoints: [],
});
const diagram = (elements: unknown[], connectors: unknown[]): DiagramData =>
  ({ elements, connectors, viewport: { x: 0, y: 0, zoom: 1 } } as unknown as DiagramData);

/** Ann holds Assessor and Appeals Officer; Bob holds Assessor. Assessment work
 *  needs Assessor; appeal work needs Appeals Officer. */
const TEAM = diagram(
  [
    el("ann", "business-actor", "Ann"),
    el("bob", "business-actor", "Bob"),
    el("assessor", "business-role", "Assessor"),
    el("appeals", "business-role", "Appeals Officer"),
    el("assessWork", "business-process", "Assess claim"),
    el("appealWork", "business-process", "Handle appeal"),
  ],
  [
    conn("a1", "archi-assignment", "ann", "assessor"),
    conn("a2", "archi-assignment", "ann", "appeals"),
    conn("a3", "archi-assignment", "bob", "assessor"),
    conn("a4", "archi-assignment", "assessor", "assessWork"),
    conn("a5", "archi-assignment", "appeals", "appealWork"),
  ],
);

describe("reading ArchiMate — actors, roles and work", () => {
  it("T3523 - an actor assigned to a role HOLDS that skill", () => {
    const m = skillsFromArchimate(TEAM);
    expect(m.people.map((p) => p.name)).toEqual(["Ann", "Bob"]);
    expect(m.people[0].skills).toEqual(["Appeals Officer", "Assessor"]);
    expect(m.people[1].skills).toEqual(["Assessor"]);
  });

  it("T3524 - a role assigned to work means that work REQUIRES the skill", () => {
    const m = skillsFromArchimate(TEAM);
    expect(m.work.find((w) => w.label === "Handle appeal")!.requiredSkills).toEqual(["Appeals Officer"]);
  });

  it("T3525 - two roles on one process is a task needing two skills", () => {
    const d = diagram(
      [...TEAM.elements],
      [...TEAM.connectors, conn("a6", "archi-assignment", "appeals", "assessWork")],
    );
    const m = skillsFromArchimate(d);
    expect(m.work.find((w) => w.label === "Assess claim")!.requiredSkills).toEqual(["Appeals Officer", "Assessor"]);
  });

  it("T3526 - Capability and Resource are NOT read: wrong grain for who may take a task", () => {
    const d = diagram(
      [...TEAM.elements, el("cap", "strategy-capability", "Claims Handling")],
      [...TEAM.connectors, conn("a7", "archi-assignment", "cap", "assessWork")],
    );
    const m = skillsFromArchimate(d);
    expect(m.skills).not.toContain("Claims Handling");
    expect(m.warnings.join(" ")).toMatch(/assignment.*ignored/i);
  });
});

describe("reading ArchiMate — roles are bundles", () => {
  it("T3527 - a role that AGGREGATES others resolves to what it is made of", () => {
    const d = diagram(
      [
        el("ann", "business-actor", "Ann"),
        el("senior", "business-role", "Senior Assessor"),
        el("assess", "business-role", "Assess"),
        el("approve", "business-role", "Approve limits"),
        el("work", "business-process", "Assess claim"),
      ],
      [
        conn("c1", "archi-aggregation", "senior", "assess"),
        conn("c2", "archi-aggregation", "senior", "approve"),
        conn("c3", "archi-assignment", "ann", "senior"),
        conn("c4", "archi-assignment", "assess", "work"),
      ],
    );
    const m = skillsFromArchimate(d);
    // Ann holds the BUNDLE, so she holds its leaves — not a skill called
    // "Senior Assessor" that no work would ever ask for.
    expect(m.people[0].skills).toEqual(["Approve limits", "Assess"]);
    expect(m.people[0].skills).not.toContain("Senior Assessor");
  });

  it("T3528 - a role that aggregates nothing simply IS a skill", () => {
    const m = skillsFromArchimate(TEAM);
    expect(m.skills).toEqual(["Appeals Officer", "Assessor"]);
  });

  it("T3529 - a containment LOOP is reported rather than hanging the walk", () => {
    const d = diagram(
      [
        el("a", "business-role", "A"),
        el("b", "business-role", "B"),
        el("ann", "business-actor", "Ann"),
      ],
      [
        conn("c1", "archi-aggregation", "a", "b"),
        conn("c2", "archi-aggregation", "b", "a"),
        conn("c3", "archi-assignment", "ann", "a"),
      ],
    );
    const m = skillsFromArchimate(d);
    expect(m.warnings.join(" ")).toMatch(/containment loop/i);
  });
});

describe("reading ArchiMate — the diagram is probably wrong", () => {
  it("T3530 - an actor with no role holds nothing, and is named", () => {
    const d = diagram([...TEAM.elements, el("cara", "business-actor", "Cara")], [...TEAM.connectors]);
    const m = skillsFromArchimate(d);
    expect(m.people.find((p) => p.name === "Cara")!.skills).toEqual([]);
    expect(m.warnings.join(" ")).toMatch(/No role is assigned to Cara/i);
  });

  it("T3531 - a skill somebody holds that no work needs is reported", () => {
    const d = diagram(
      [...TEAM.elements, el("extra", "business-role", "Fraud review")],
      [...TEAM.connectors, conn("a8", "archi-assignment", "ann", "extra")],
    );
    const m = skillsFromArchimate(d);
    expect(m.warnings.join(" ")).toMatch(/No work requires Fraud review/i);
  });
});

describe("matching onto the simulation", () => {
  const model = skillsFromArchimate(TEAM);

  it("T3532 - members and tasks are matched by name, and get their skills", () => {
    const r = matchSkills(model, ["Ann", "Bob"], ["Assess claim", "Handle appeal"]);
    expect(r.units).toEqual([
      { name: "Ann", skills: ["Appeals Officer", "Assessor"] },
      { name: "Bob", skills: ["Assessor"] },
    ]);
    expect(r.taskSkills["Handle appeal"]).toEqual(["Appeals Officer"]);
  });

  it("T3533 - matching is case- and whitespace-insensitive, like every other link", () => {
    expect(normaliseLabel("  Assess   Claim ")).toBe("assess claim");
    const r = matchSkills(model, ["  ann "], ["ASSESS CLAIM"]);
    expect(r.units).toHaveLength(1);
    expect(r.taskSkills["ASSESS CLAIM"]).toEqual(["Assessor"]);
  });

  it("T3534 - EVERYTHING that did not match is reported, in both directions", () => {
    const r = matchSkills(model, ["Ann", "Dave"], ["Assess claim", "Archive file"]);
    expect(r.unmatchedMembers).toEqual(["Dave"]);        // in the team, not in the diagram
    expect(r.unmatchedActors).toEqual(["Bob"]);          // in the diagram, not in the team
    expect(r.unmatchedWork).toEqual(["Handle appeal"]);  // in the diagram, not a task
  });

  it("T3535 - a fill that matched NOTHING says so, rather than looking like it worked", () => {
    const r = matchSkills(model, ["Xavier"], ["Something else"]);
    expect(r.units).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/No team member matched an actor/i);
    expect(r.warnings.join(" ")).toMatch(/No task matched work/i);
  });

  it("T3536 - the model's own warnings are carried through, not dropped at the match", () => {
    const withIdle = skillsFromArchimate(
      diagram([...TEAM.elements, el("cara", "business-actor", "Cara")], [...TEAM.connectors]),
    );
    const r = matchSkills(withIdle, ["Ann"], ["Assess claim"]);
    expect(r.warnings.join(" ")).toMatch(/No role is assigned to Cara/i);
  });
});
