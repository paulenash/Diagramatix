/**
 * The seeded starter examples must be FULLY OPERATIONAL: every package is
 * structurally valid, every diagram assembles + runs, and each study's
 * portfolio produces real throughput — so an adopt yields a sim a user can
 * Run / Replay / compare immediately.
 */
import { describe, it, expect } from "vitest";
import { STARTER_EXAMPLES } from "@/app/lib/simulation/exampleSeeds";
import { validateExamplePackage } from "@/app/lib/simulation/examplePackage";
import { assemblePortfolio } from "@/app/lib/simulation/network";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { applyOverrides, type OverrideSet } from "@/app/lib/simulation/overrides";

describe("starter examples are operational", () => {
  it("there is a non-trivial starter set with unique slugs", () => {
    expect(STARTER_EXAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(new Set(STARTER_EXAMPLES.map((e) => e.slug)).size).toBe(STARTER_EXAMPLES.length);
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

      it("assembles its study portfolio with shared team pools", () => {
        const teamCaps = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
        const roots = pkg.study.rootKeys.map((k) => pkg.diagrams.find((d) => d.key === k)!).filter(Boolean);
        const net = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), { teamCapacities: teamCaps });
        expect(net.nodes.length).toBeGreaterThan(0);
        // Every distinct team becomes exactly one pool.
        expect(net.teams.length).toBe(pkg.teams.length);
      });

      it("every scenario runs and completes work", () => {
        const teamCaps = Object.fromEntries(pkg.teams.map((t) => [t.name, t.capacity]));
        const roots = pkg.study.rootKeys.map((k) => pkg.diagrams.find((d) => d.key === k)!);
        const baseline = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), { teamCapacities: teamCaps });
        for (const sc of pkg.scenarios) {
          const net = applyOverrides(baseline, (sc.overrides ?? {}) as OverrideSet);
          const { stats } = runMonteCarlo(net, sc.runConfig, sc.runConfig.interventions);
          expect(stats.completed.mean, `${ex.title} / ${sc.name}`).toBeGreaterThan(0);
        }
      });
    });
  }

  it("the bottleneck example actually shows relief when staffed up", () => {
    const ex = STARTER_EXAMPLES.find((e) => e.slug === "single-bottleneck")!;
    const roots = ex.package.study.rootKeys.map((k) => ex.package.diagrams.find((d) => d.key === k)!);
    const base = assemblePortfolio(roots.map((d) => ({ id: d.key, data: d.data })), { teamCapacities: { Analysts: 1 } });
    const baseline = ex.package.scenarios[0];
    const staffed = ex.package.scenarios[1];
    const rBase = runMonteCarlo(applyOverrides(base, (baseline.overrides ?? {}) as OverrideSet), baseline.runConfig);
    const rStaff = runMonteCarlo(applyOverrides(base, (staffed.overrides ?? {}) as OverrideSet), staffed.runConfig);
    // More capacity → strictly lower utilisation on the shared pool.
    expect(rStaff.stats.perTeam.Analysts.utilization.mean).toBeLessThan(rBase.stats.perTeam.Analysts.utilization.mean);
  });
});
