/**
 * Compliance Monitoring aggregation (buildComplianceReport): the org-wide
 * Σapplied/Σexpected rollup per control code over time, plus below-threshold /
 * declining detection and per-project latest. Pure, no DB.
 */
import { describe, it, expect } from "vitest";
import { buildComplianceReport, type ComplianceRunInput, type ComplianceControlInput } from "@/app/lib/riskControls/compliance";
import type { GovernanceStats } from "@/app/lib/mining/types";
import type { ConformanceResult } from "@/app/lib/mining/transitionConformance";

const gov = (controls: Record<string, { applied: number; expected: number }>): GovernanceStats =>
  ({ controls: Object.fromEntries(Object.entries(controls).map(([k, v]) => [k,
    { applied: v.applied, expected: v.expected, bypassed: v.expected - v.applied, effectivenessPct: Math.round((v.applied / v.expected) * 1000) / 10 }])) }) as unknown as GovernanceStats;

const run = (id: string, projectId: string, projectName: string, createdAt: string, governance: GovernanceStats, fitness: number): ComplianceRunInput =>
  ({ id, name: `run ${id}`, projectId, projectName, createdAt, governance,
     conformance: { fitness, totalCases: 100, conformingCases: 0, violations: [], transitionStats: [] } as ConformanceResult });

describe("compliance aggregation", () => {
  it("T0656 — rolls up Σapplied/Σexpected per code over runs; flags below-threshold + declining", () => {
    const runs: ComplianceRunInput[] = [
      run("A", "P1", "Alpha", "2026-01-01T00:00:00Z", gov({ "C-001": { applied: 80, expected: 100 }, "C-002": { applied: 95, expected: 100 } }), 0.9),
      run("B", "P2", "Bravo", "2026-01-02T00:00:00Z", gov({ "C-001": { applied: 60, expected: 100 } }), 0.8),
      run("C", "P1", "Alpha", "2026-01-03T00:00:00Z", gov({ "C-001": { applied: 90, expected: 100 }, "C-002": { applied: 70, expected: 100 } }), 0.95),
    ];
    const controls: ComplianceControlInput[] = [
      { code: "C-001", name: "Three-way match", monitorSignature: null },
      { code: "C-002", name: "Approval limit", monitorSignature: null },
    ];

    const r = buildComplianceReport(runs, controls, { threshold: 80 });

    // Headline
    expect(r.summary.runCount).toBe(3);
    expect(r.summary.projectCount).toBe(2);
    expect(r.summary.controlCount).toBe(2);
    // Overall = (80+95+60+90+70) / (5*100) = 395/500
    expect(r.summary.overallEffPct).toBe(79);
    expect(r.summary.latestFitnessPct).toBe(95); // most recent run (C)

    // C-001 rollup = 230/300 = 76.7; latest = run C = 90; healthy
    const c1 = r.controls.find((c) => c.code === "C-001")!;
    expect(c1.orgEffPct).toBe(76.7);
    expect(c1.latestEffPct).toBe(90);
    expect(c1.belowThreshold).toBe(false);
    expect(c1.declining).toBe(false);

    // C-002 = 165/200 = 82.5 rollup, but latest (70) < prev (95) → declining + below
    const c2 = r.controls.find((c) => c.code === "C-002")!;
    expect(c2.orgEffPct).toBe(82.5);
    expect(c2.latestEffPct).toBe(70);
    expect(c2.belowThreshold).toBe(true);
    expect(c2.declining).toBe(true);

    // At-risk sorts first
    expect(r.controls[0].code).toBe("C-002");
    expect(r.summary.controlsBelowThreshold).toBe(1);
    expect(r.summary.decliningControls).toBe(1);

    // Per-project latest run
    const p1 = r.projects.find((p) => p.projectId === "P1")!;
    expect(p1.runCount).toBe(2);
    expect(p1.latestEffPct).toBe(80); // run C: (90+70)/200
    const p2 = r.projects.find((p) => p.projectId === "P2")!;
    expect(p2.latestEffPct).toBe(60);
  });

  it("T0657 — falls back to conformance-deviation effectiveness when no governance", () => {
    const conf = {
      fitness: 0.8, totalCases: 200, conformingCases: 160,
      violations: [{ rule: "undocumented-transition", severity: "error", message: "skip approval", cases: 40, data: { from: "A", to: "B" } }],
      transitionStats: [],
    } as ConformanceResult;
    const runs: ComplianceRunInput[] = [
      { id: "R", name: "run R", projectId: "P1", projectName: "Alpha", createdAt: "2026-02-01T00:00:00Z", governance: null, conformance: conf },
    ];
    const controls: ComplianceControlInput[] = [
      { code: "C-009", name: "Approval control", monitorSignature: "undocumented-transition|A|B" },
    ];
    const r = buildComplianceReport(runs, controls, { threshold: 80 });
    // 40 of 200 bypassed → 160/200 = 80%
    const c = r.controls.find((x) => x.code === "C-009")!;
    expect(c.orgEffPct).toBe(80);
    expect(c.points[0].applied).toBe(160);
    expect(c.points[0].expected).toBe(200);
  });
});
