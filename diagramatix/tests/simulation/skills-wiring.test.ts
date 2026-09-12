/**
 * Skills, steps 2, 3 and 5 — the wiring that makes the master list mean
 * something.
 *
 * Step 2: people on a team hold skills, picked from the list.
 * Step 3: every example is populated, and NONE of them changes behaviour.
 * Step 5: a task requires skills, picked from the same list; only someone on
 *         the task's team who holds them can do the work.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ResourcePool } from "@/app/lib/simulation/resourcePool";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const EXAMPLES = JSON.parse(read("app/lib/simulation/exampleData.json")) as {
  examples: { slug: string; package?: {
    teams?: { name: string; capacity: number; members?: { name: string; skills: string[] }[] }[];
    diagrams?: { data?: { elements?: { properties?: { sim?: { requiredSkills?: string[] } } }[] } }[];
  } }[];
};

describe("step 2 — people on a team hold skills", () => {
  it("T4264 — one picker serves both halves of the match", () => {
    // A task requires what a person holds. Two pickers, or two lists, is how
    // the two vocabularies drift apart again — which is the problem the master
    // list was built to solve one level up.
    const picker = read("app/components/simulation/SkillPicker.tsx");
    expect(read("app/components/simulation/TeamLibraryManager.tsx")).toContain("SkillPicker");
    expect(read("app/components/simulation/SimDataPanel.tsx")).toContain("SkillPicker");
    expect(picker).toContain("/api/skills");
  });

  it("T4265 — a skill already on the record shows even when the catalog no longer offers it", () => {
    // Models predate the catalog and a retired skill still RESOLVES. Hiding one
    // would suggest a constraint had gone while the engine still enforces it.
    const picker = read("app/components/simulation/SkillPicker.tsx");
    expect(picker).toContain("const unknown = !known.has(name)");
    expect(picker).toMatch(/is not in the Skills list/);
  });

  it("T4266 — the team editor says what naming nobody MEANS", () => {
    // The invisible failure: a team with no members grants every requirement to
    // anyone, so a task's skills are ignored and the run shows no queue where
    // there should be one. An empty roster must not read as merely empty.
    const mgr = read("app/components/simulation/TeamLibraryManager.tsx");
    expect(mgr).toMatch(/granted to[\s\S]{0,40}anyone on it/);
    expect(mgr).toContain("counted pool");
  });
});

describe("step 3 — every example is filled, and none of them changed", () => {
  it("T4267 — every example names people, except the automation pools", () => {
    for (const ex of EXAMPLES.examples) {
      // Hire & Onboard names people where naming DOES something and leaves
      // Hiring Manager a counted pool on purpose — no hiring-manager task
      // carries a requirement, so four names there would assert a distinction
      // the model does not make.
      if (ex.slug === "hire-and-onboard") continue;
      const teams = ex.package?.teams ?? [];
      if (!teams.length) continue;
      const human = teams.filter((t) => !/\b(ai|agent|bot|robot|automation|system)\b/i.test(t.name));
      const unnamed = human.filter((t) => !(t.members?.length));
      expect(unnamed.map((t) => `${ex.slug}/${t.name}`), "run scripts/fill-example-skills.ts").toEqual([]);
    }
  });

  it("T4268 — NO example outside Hire & Onboard constrains a task", () => {
    // Paul, step 3: the others must "work as they currently do without any
    // skills constraints". People hold skills; nothing requires them.
    for (const ex of EXAMPLES.examples) {
      if (ex.slug === "hire-and-onboard") continue;
      const required = (ex.package?.diagrams ?? []).flatMap((d) =>
        (d.data?.elements ?? []).flatMap((el) => el.properties?.sim?.requiredSkills ?? []));
      expect(required, `${ex.slug} has task skill requirements`).toEqual([]);
    }
  });

  it("T4269 — Hire & Onboard KEEPS its constraints", () => {
    // The one example where skills do something. Paul chose to keep it, and
    // stripping it would collapse its six scenarios back to identical (T4243).
    const ho = EXAMPLES.examples.find((e) => e.slug === "hire-and-onboard");
    const required = new Set((ho?.package?.diagrams ?? []).flatMap((d) =>
      (d.data?.elements ?? []).flatMap((el) => el.properties?.sim?.requiredSkills ?? [])));
    expect(required.has("Compliance Accreditation")).toBe(true);
    expect(required.size).toBeGreaterThanOrEqual(4);
  });

  it("T4270 — naming people changes nothing while no task requires a skill", () => {
    // THE property that makes step 3 safe. Naming anybody flips ResourcePool
    // off its counted path onto pickUnits, which selects named individuals —
    // a different code path, so this is asserted rather than assumed.
    const counted = new ResourcePool(3);
    const named = new ResourcePool(3, 0, "fifo", [
      { id: "a", name: "a", skills: ["Quality Review"] },
      { id: "b", name: "b", skills: [] },
      { id: "c", name: "c", skills: ["Underwriting", "Legal Review"] },
    ]);
    for (const pool of [counted, named]) {
      expect(pool.request(0, 1, "one")).toBe(true);
      expect(pool.request(0, 1, "two")).toBe(true);
      expect(pool.request(0, 1, "three")).toBe(true);
      expect(pool.request(0, 1, "four"), "the fourth must queue in both").toBe(false);
    }
  });
});

describe("step 5 — only a qualified person on the task's team can do the work", () => {
  it("T4271 — a requirement is met by the holders, and queues when they are busy", () => {
    // Paul, step 5: "Only a person within the Task's assigned Team/Role can
    // complete this Task." The team is the pool; the skills narrow it.
    const pool = new ResourcePool(4, 0, "fifo", [
      { id: "grace", name: "grace", skills: ["Onboarding", "Compliance"] },
      { id: "ruth",  name: "ruth",  skills: ["Onboarding", "Compliance"] },
      { id: "ben",   name: "ben",   skills: ["Onboarding"] },
      { id: "marta", name: "marta", skills: ["Onboarding"] },
    ]);

    // Two accredited people: two accredited jobs run, the third waits — even
    // though the TEAM has four people and two are idle. That gap between
    // capacity and eligibility is the entire point of skills.
    // The `key` matters: it is what records WHICH person took the work. See
    // T4273 — without it the pool tracks the headcount but not the individual.
    expect(pool.request(0, 1, "c1", { requiredSkills: ["Compliance"], key: "c1" })).toBe(true);
    expect(pool.request(0, 1, "c2", { requiredSkills: ["Compliance"], key: "c2" })).toBe(true);
    expect(pool.request(0, 1, "c3", { requiredSkills: ["Compliance"], key: "c3" })).toBe(false);

    // ...while unskilled work still flows, because Ben and Marta are free.
    expect(pool.request(0, 1, "u1", { requiredSkills: ["Onboarding"], key: "u1" })).toBe(true);
  });

  it("T4273 — the engine passes a `key`, which is what makes the skill gate bite", () => {
    // A sharp edge worth pinning. ResourcePool records who is busy in
    // `assigned`, and `assigned` is only written when the caller supplies a
    // key. Request with skills and no key and capacity is still respected —
    // but the SAME PERSON can be handed out twice, because nothing recorded
    // that they were taken.
    const noKey = new ResourcePool(4, 0, "fifo", [
      { id: "grace", name: "grace", skills: ["Compliance"] },
      { id: "ruth",  name: "ruth",  skills: ["Compliance"] },
      { id: "ben",   name: "ben",   skills: [] },
      { id: "marta", name: "marta", skills: [] },
    ]);
    expect(noKey.request(0, 1, "a", { requiredSkills: ["Compliance"] })).toBe(true);
    expect(noKey.request(0, 1, "b", { requiredSkills: ["Compliance"] })).toBe(true);
    // Only two people hold it, yet a third is granted — nothing recorded the
    // first two as taken.
    expect(noKey.request(0, 1, "c", { requiredSkills: ["Compliance"] })).toBe(true);

    // Which is why the engine's one call site MUST pass a key, and does.
    const engine = read("app/lib/simulation/engine.ts");
    const at = engine.indexOf("pool.request(");
    expect(at).toBeGreaterThan(-1);
    const call = engine.slice(at, engine.indexOf("});", at));
    expect(call, "a request carrying requiredSkills must carry a key").toContain("key: token.id");
    expect(call).toContain("requiredSkills: node.requiredSkills");
    // ...and there is only the one, so no second site can forget.
    expect(engine.split("pool.request(").length - 1, "a new call site must also pass a key").toBe(1);
  });

  it("T4272 — a requirement nobody holds NEVER starts, rather than falling through", () => {
    // The dangerous alternative would be to grant it anyway: the run would
    // complete, report no queue, and be wrong in the flattering direction.
    const pool = new ResourcePool(2, 0, "fifo", [
      { id: "x", name: "x", skills: ["Onboarding"] },
      { id: "y", name: "y", skills: ["Onboarding"] },
    ]);
    expect(pool.request(0, 1, "impossible", { requiredSkills: ["Compliance"] })).toBe(false);
  });
});
