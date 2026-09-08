/**
 * The seeded starter examples must be FULLY OPERATIONAL: every package is
 * structurally valid, every diagram assembles + runs, and each study's
 * portfolio produces real throughput — so an adopt yields a sim a user can
 * Run / Replay / compare immediately.
 */
import { describe, it, expect } from "vitest";
import { STARTER_EXAMPLES } from "@/app/lib/simulation/exampleSeeds";
import { validateExamplePackage, type ExamplePackage, type ExampleScenario } from "@/app/lib/simulation/examplePackage";
import { assemblePortfolio } from "@/app/lib/simulation/network";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";
import { calendarWarnings } from "@/app/lib/simulation/calendar";

/** The diagrams a scenario actually runs: its pinned process variant (As-is vs
 *  To-be comparison) when set, otherwise the study's roots. Mirrors the run
 *  route's variant logic so the tests exercise what a real run does. */
function rootsFor(pkg: ExamplePackage, sc: ExampleScenario) {
  const keys = sc.variantRootKeys?.length ? sc.variantRootKeys : pkg.study.rootKeys;
  return keys.map((k) => pkg.diagrams.find((d) => d.key === k)!).filter(Boolean);
}
const maxUtil = (perTeam: Record<string, { utilization: { mean: number } }>) =>
  Math.max(0, ...Object.values(perTeam).map((t) => t.utilization.mean));

/**
 * Assemble options built from the package the way the RUN ROUTE builds them.
 *
 * The people were missing. Every assemble here passed capacities only, so an
 * example with a skills matrix was run as a counted pool and every task's
 * requiredSkills was ignored — the suite could not have noticed skills breaking,
 * and a scenario that added a person to a team the test thought was unnamed
 * behaved completely differently here than in the app.
 */
function assembleOpts(pkg: ExamplePackage) {
  const teamUnits: Record<string, { id: string; name: string; skills: string[] }[]> = {};
  for (const t of pkg.teams) {
    if (!t.members?.length) continue;
    teamUnits[t.name] = t.members.map((m) => ({ id: m.name, name: m.name, skills: m.skills ?? [] }));
  }
  const calendarsById = Object.fromEntries((pkg.calendars ?? []).map((c) => [c.name, c.pattern]));
  const teamCalendars: Record<string, (typeof calendarsById)[string]> = {};
  for (const t of pkg.teams) if (t.calendarName && calendarsById[t.calendarName]) teamCalendars[t.name] = calendarsById[t.calendarName];
  return {
    teamCapacities: Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity])),
    teamUnits,
    teamCalendars,
    calendarsById,
  };
}

describe("starter examples are operational", () => {
  it("there is a non-trivial starter set with unique slugs", () => {
    expect(STARTER_EXAMPLES.length).toBeGreaterThanOrEqual(2);
    expect(new Set(STARTER_EXAMPLES.map((e) => e.slug)).size).toBe(STARTER_EXAMPLES.length);
  });

  // Every OTHER assertion in this file iterates STARTER_EXAMPLES, so they all
  // still pass when an example is silently DELETED from exampleData.json - the
  // survivors remain valid. That is not hypothetical: gen-bpmn-examples.ts wrote
  // the whole file from its own two METAS, wiping the three entries it did not
  // own. That script is now retired and deleted, and exampleData.json is the
  // source of truth (see app/lib/simulation/exampleSeeds.ts) - but the two
  // surviving per-example generators still rewrite entries, and a future one
  // could too. Extend the list when a new example ships - never shorten it to go
  // green.
  it("T3369 - every catalog example is still present (a generator must merge, not overwrite)", () => {
    const EXPECTED = [
      "simple-process",
      "loan-origination",
      "car-repair-rework-loop",
      "aardwolf-loan-comparison",
      "sales-marketing-drill-through",
      "hire-and-onboard",
    ];
    const present = new Set(STARTER_EXAMPLES.map((e) => e.slug));
    const missing = EXPECTED.filter((slug) => !present.has(slug));
    expect(missing, `examples lost from exampleData.json: ${missing.join(", ")}`).toEqual([]);
  });

  // The level a learner sees is a JUDGEMENT about teaching order, not a fact
  // about the package, so nothing in the data can derive it and nothing else
  // in this suite would notice it changing. Paul re-levelled these on
  // 2026-09-08: loan-origination is an introduction, and the three that were
  // 'advanced' are the core set - which leaves 'advanced' meaning the capstone
  // example that exercises the whole feature set, not merely a longer diagram.
  it("T3561 - each example carries its intended level", () => {
    const LEVELS: Record<string, string> = {
      "simple-process": "intro",
      "loan-origination": "intro",
      "car-repair-rework-loop": "core",
      "aardwolf-loan-comparison": "core",
      "sales-marketing-drill-through": "core",
      "hire-and-onboard": "advanced",
    };
    for (const ex of STARTER_EXAMPLES) {
      const want = LEVELS[ex.slug];
      if (!want) continue; // a newly added example registers itself here when it ships
      expect(ex.difficulty, `${ex.slug} should be levelled ${want}`).toBe(want);
    }
  });

  // A typo here does not fail the seed - it writes straight through to the
  // catalog row, where the gallery falls back to a neutral chip and the level
  // silently stops meaning anything.
  it("T3562 - every level is one the gallery and the admin routes accept", () => {
    for (const ex of STARTER_EXAMPLES) {
      expect(["intro", "core", "advanced"], `${ex.slug} has level "${ex.difficulty}"`).toContain(ex.difficulty);
    }
  });

  it("every diagram is EDITOR-valid (connectors fully formed, not just engine-valid)", () => {
    // A bare {id,source,target} connector runs in the engine but crashes the
    // editor, which maps over connector.waypoints + reads routing fields on
    // load. Guard against that regression.
    for (const ex of STARTER_EXAMPLES) {
      for (const d of ex.package.diagrams) {
        for (const c of d.data.connectors) {
          expect(Array.isArray(c.waypoints), `${ex.slug}/${c.id} waypoints`).toBe(true);
          expect(c.type, `${ex.slug}/${c.id} type`).toBeTruthy();
          expect(c.sourceSide && c.targetSide).toBeTruthy();
          expect(c.directionType && c.routingType).toBeTruthy();
          expect(typeof c.sourceInvisibleLeader).toBe("boolean");
          expect(typeof c.targetInvisibleLeader).toBe("boolean");
        }
        for (const el of d.data.elements) {
          expect(el.id && el.type).toBeTruthy();
          expect(Number.isFinite(el.x) && Number.isFinite(el.width)).toBe(true);
        }
      }
    }
  });

  for (const ex of STARTER_EXAMPLES) {
    describe(ex.title, () => {
      const pkg = ex.package;

      it("has a valid package", () => {
        expect(validateExamplePackage(pkg)).toEqual([]);
      });

      it("assembles each scenario's roots, and every referenced team is in the library", () => {
        const libNames = new Set(pkg.teams.map((t) => t.name));
        for (const sc of pkg.scenarios) {
          const roots = rootsFor(pkg, sc);
          const net = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), assembleOpts(pkg));
          expect(net.nodes.length, `${ex.title} / ${sc.name}`).toBeGreaterThan(0);
          // Every team a task seizes must exist in the library (no dangling refs);
          // the library may also hold teams for lanes not yet parameterized.
          for (const t of net.teams) expect(libNames.has(t.id), `${ex.slug} team ${t.id} in library`).toBe(true);
        }
      });

      it("every scenario runs and completes work", () => {
        for (const sc of pkg.scenarios) {
          // Run the scenario against ITS diagrams (variant roots if pinned).
          const roots = rootsFor(pkg, sc);
          const base = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), assembleOpts(pkg));
          const net = applyOverrides(base, (sc.overrides ?? {}) as OverrideSet);
          const { stats } = runMonteCarlo(net, sc.runConfig, sc.runConfig.interventions);
          expect(stats.completed.mean, `${ex.title} / ${sc.name}`).toBeGreaterThan(0);
        }
      });
    });
  }

  it("T0542 — as-is/to-be comparison examples show the to-be relieving the busiest team", () => {
    const runVariant = (pkg: ExamplePackage, sc: ExampleScenario) => {
      const roots = rootsFor(pkg, sc);
      const net = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), assembleOpts(pkg));
      return runMonteCarlo(applyOverrides(net, (sc.overrides ?? {}) as OverrideSet), sc.runConfig);
    };
    const comparisons = STARTER_EXAMPLES.filter((e) => e.package.scenarios.some((s) => s.variantRootKeys?.length));
    expect(comparisons.length).toBeGreaterThanOrEqual(1); // the Aardwolf pair
    for (const ex of comparisons) {
      const [asIs, toBe] = ex.package.scenarios;
      const rAsIs = runVariant(ex.package, asIs);
      const rToBe = runVariant(ex.package, toBe);
      // The redesigned (To-be) process should load its busiest team less than the
      // manual (As-is) one — the automation payoff the comparison exists to show.
      expect(maxUtil(rToBe.stats.perTeam), `${ex.slug} to-be busiest vs as-is`).toBeLessThan(maxUtil(rAsIs.stats.perTeam));
    }
  });

  it("T0571 — every example carries a working calendar its human teams follow (AI teams stay 24/7)", () => {
    const IS_AUTOMATION = (name: string) => /\b(ai|agent|bot|automat|robot|system)\b/i.test(name);
    for (const ex of STARTER_EXAMPLES) {
      const cals = ex.package.calendars ?? [];
      expect(cals.length, `${ex.slug} has a calendar`).toBeGreaterThan(0);
      const calNames = new Set(cals.map((c) => c.name));
      // Every referenced calendar exists + has no overlap warnings.
      for (const c of cals) expect(calendarWarnings(c.pattern), `${ex.slug}/${c.name}`).toEqual([]);
      // Human teams are linked to a calendar; automation teams are not.
      for (const t of ex.package.teams) {
        if (IS_AUTOMATION(t.name)) continue;
        expect(t.calendarName && calNames.has(t.calendarName), `${ex.slug}/${t.name} linked to a real calendar`).toBe(true);
      }
    }
  });

  it("T0553 — the subprocess drill-through sample flattens its linked children (they carry work)", () => {
    const ex = STARTER_EXAMPLES.find((e) => e.slug === "sales-marketing-drill-through");
    if (!ex) return; // sample optional in some builds
    const byId = new Map(ex.package.diagrams.map((d) => [d.key, d.data]));
    const rootKey = ex.package.study.rootKeys[0];
    const spliced = spliceLinkedSubprocesses(byId.get(rootKey)!, rootKey, byId);
    // the linked children are flattened in (their node ids carry the "<subId>~" prefix)
    expect(spliced.elements.some((e) => e.id.includes("~"))).toBe(true);
    const caps = Object.fromEntries(ex.package.teams.map((t) => [t.name, t.capacity]));
    const { stats } = runMonteCarlo(assembleFromDiagram(spliced, { teamCapacities: caps }), ex.package.scenarios[0].runConfig);
    // teams that ONLY exist inside the subprocesses must be busy → tokens drilled through
    expect(stats.perTeam["Sales Team"]?.utilization.mean).toBeGreaterThan(0);
    expect(stats.perTeam["Marketing Team"]?.utilization.mean).toBeGreaterThan(0);
  });

  it("staffing up relieves the busiest pool (baseline vs add-staff)", () => {
    for (const ex of STARTER_EXAMPLES) {
      // Comparison examples ([As-is, To-be] variants) aren't baseline/add-staff —
      // covered by the dedicated to-be-relief test above. Single-scenario examples
      // (e.g. a drill-through demo) have no add-staff variant to compare.
      if (ex.package.scenarios.some((s) => s.variantRootKeys?.length)) continue;
      if (ex.package.scenarios.length < 2) continue;
      const roots = ex.package.study.rootKeys.map((k) => ex.package.diagrams.find((d) => d.key === k)!);
      const base = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), assembleOpts(ex.package));
      const [baseline, staffed] = ex.package.scenarios;
      const rBase = runMonteCarlo(applyOverrides(base, (baseline.overrides ?? {}) as OverrideSet), baseline.runConfig);
      const rStaff = runMonteCarlo(applyOverrides(base, (staffed.overrides ?? {}) as OverrideSet), staffed.runConfig);
      // The team most loaded at baseline should be no busier (≈ less busy) once staffed.
      const busiest = Object.entries(rBase.stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean)[0];
      if (busiest) {
        expect(rStaff.stats.perTeam[busiest[0]].utilization.mean, `${ex.slug}/${busiest[0]}`).toBeLessThanOrEqual(busiest[1].utilization.mean + 1e-9);
      }
    }
  });
});
