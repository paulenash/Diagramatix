/**
 * Feature Availability slice 8 (plan 2026-09-30): the public pages are built
 * from the plans themselves — limits from the SubscriptionLevel row, features
 * from the availability matrix, the trial length from the Free plan — so an
 * edit in the SuperAdmin editor shows on the next request with nothing to keep
 * in step.
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("@/app/lib/db", () => ({ prisma: {} }));
vi.mock("@/auth", () => ({ auth: async () => null }));

import { limitLines, trialPhrase, type PlanLimits } from "@/app/lib/subscription/publicCopy";
import { buildPublicMatrix } from "@/app/lib/features/publicMatrix";
import { TIER_COPY } from "@/app/(marketing)/pricing/page";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const plan = (o: Partial<PlanLimits> = {}): PlanLimits => ({
  trialDays: null, maxProjects: null, maxDiagramsPerTypePerProject: null, maxArchimateDiagramsTotal: null,
  maxBpmnElementsPerDiagram: null, maxNonBpmnElementsPerDiagram: null, maxAiAttempts: null, aiAttemptsResetMonthly: true,
  maxIndividualExports: null, individualExportsResetMonthly: true, maxIndividualImports: null, individualImportsResetMonthly: true,
  maxBulkExports: null, maxBulkImports: null, ...o,
});

describe("T5133 — the limit lines come from the plan's own numbers", () => {
  it("Free: the trial, one project, a lifetime AI allowance, lifetime exports and imports, small diagrams, no bulk, no ArchiMate line", () => {
    const lines = limitLines(plan({
      trialDays: 30, maxProjects: 1, maxDiagramsPerTypePerProject: 1, maxArchimateDiagramsTotal: 0,
      maxBpmnElementsPerDiagram: 20, maxNonBpmnElementsPerDiagram: 15,
      maxAiAttempts: 5, aiAttemptsResetMonthly: false,
      maxIndividualExports: 2, individualExportsResetMonthly: false, maxIndividualImports: 2, individualImportsResetMonthly: false,
      maxBulkExports: 0, maxBulkImports: 0,
    }));
    expect(lines).toEqual([
      "30-day free trial",
      "1 project",
      "Up to 1 diagram of each type per project",
      "20 elements per BPMN diagram, 15 for other types",
      "5 AI Generate attempts in total",
      "2 individual exports in total",
      "2 individual imports in total",
    ]);
  });

  it("a paid plan: counts, monthly allowances, bulk; equal element caps read as one line", () => {
    const lines = limitLines(plan({
      maxProjects: 5, maxDiagramsPerTypePerProject: 10, maxArchimateDiagramsTotal: 2,
      maxAiAttempts: 50, maxIndividualExports: null, maxIndividualImports: null, maxBulkExports: 2, maxBulkImports: 2,
      maxBpmnElementsPerDiagram: 100, maxNonBpmnElementsPerDiagram: 100,
    }));
    expect(lines).toContain("5 projects");
    expect(lines).toContain("Up to 10 diagrams of each type per project");
    expect(lines).toContain("2 ArchiMate diagrams");
    expect(lines).toContain("100 elements per diagram");
    expect(lines).toContain("50 AI Generate attempts per month");
    expect(lines).toContain("Unlimited individual exports");
    expect(lines).toContain("Bulk Visio: 2 exports and 2 imports per month");
    expect(lines.some((l) => l.includes("trial"))).toBe(false);
  });

  it("unlimited says unlimited everywhere (null = no limit) — a plan added later needs no copy", () => {
    const lines = limitLines(plan());
    expect(lines).toEqual([
      "Unlimited projects",
      "Unlimited ArchiMate diagrams",
      "No limit on diagram size",
      "Unlimited AI Generate attempts",
      "Unlimited individual exports",
      "Unlimited individual imports",
      "Unlimited bulk export and import",
    ]);
  });

  it("the trial phrase is data; with no trial it carries no number", () => {
    expect(trialPhrase(30)).toBe("30-day free trial");
    expect(trialPhrase(14)).toBe("14-day free trial");
    expect(trialPhrase(null)).toBe("free trial");
    expect(trialPhrase(0)).toBe("free trial");
  });

  it("the typed copy has no numbers left in it (they would go stale)", () => {
    for (const [tier, c] of Object.entries(TIER_COPY)) {
      expect(c.blurb, `${tier} blurb`).not.toMatch(/\d/);
      for (const x of c.extras) expect(x, `${tier}: ${x}`).not.toMatch(/\d/);
    }
  });
});

describe("T5134 — the comparison table is the availability matrix", () => {
  const levels = [
    { id: "expert", name: "Expert", sortOrder: 4 }, { id: "free", name: "Free", sortOrder: 1 }, { id: "introductory", name: "Introductory", sortOrder: 2 },
  ];
  const defs = [
    { key: "a", label: "Alpha", category: "Authoring" as const },
    { key: "b", label: "Beta", category: "Authoring" as const },
    { key: "voice", label: "Voice", category: "Authoring" as const },
    { key: "mobile", label: "Mobile", category: "Platform" as const, requires: ["voice"] },
    { key: "off", label: "Off everywhere", category: "Platform" as const },
    { key: "soc2", label: "Audit report", category: "Enterprise" as const },
  ];
  const gates = { a: { status: "wired" }, b: { status: "wired" }, voice: { status: "wired" }, mobile: { status: "wired" }, off: { status: "wired" }, soc2: { status: "informational" } } as never;
  const rows = [
    { levelId: "free", featureKey: "a", state: "hidden" }, { levelId: "introductory", featureKey: "a", state: "available" }, { levelId: "expert", featureKey: "a", state: "available" },
    { levelId: "free", featureKey: "b", state: "disabled" }, { levelId: "introductory", featureKey: "b", state: "hidden" },
    { levelId: "free", featureKey: "voice", state: "hidden" }, { levelId: "introductory", featureKey: "voice", state: "hidden" },
    { levelId: "free", featureKey: "off", state: "hidden" }, { levelId: "introductory", featureKey: "off", state: "hidden" }, { levelId: "expert", featureKey: "off", state: "hidden" },
  ];
  const m = buildPublicMatrix(levels, rows, defs, gates);
  const cells = (key: string) => m.groups.flatMap((g) => g.rows).find((r) => r.key === key)?.cells;

  it("levels come in plan order; features are grouped by category", () => {
    expect(m.levels.map((l) => l.name)).toEqual(["Free", "Introductory", "Expert"]);
    expect(m.groups.map((g) => g.category)).toEqual(["Authoring", "Platform"]);
  });

  it("Available is included, Disabled is 'soon', Not Available is no; a missing row fails open (the app's own rule)", () => {
    expect(cells("a")).toEqual({ free: "no", introductory: "included", expert: "included" });
    expect(cells("b")).toEqual({ free: "soon", introductory: "no", expert: "included" });
    expect(cells("voice")).toEqual({ free: "no", introductory: "no", expert: "included" });
  });

  it("prerequisites apply: Mobile is not 'included' on a plan that lacks Voice", () => {
    expect(cells("mobile")).toEqual({ free: "no", introductory: "no", expert: "included" });
  });

  it("a feature off on every plan, and an informational entry, are left out (no false claim, nothing to compare)", () => {
    expect(cells("off")).toBeUndefined();
    expect(cells("soc2")).toBeUndefined();
  });

  it("an unreadable state counts as no", () => {
    const bad = buildPublicMatrix(levels, [{ levelId: "expert", featureKey: "a", state: "garbage" }], defs, gates);
    expect(bad.groups.flatMap((g) => g.rows).find((r) => r.key === "a")?.cells.expert).toBe("no");
  });
});

describe("T5135 — the public pages read the plans, not typed numbers", () => {
  it("pricing: the bullet lines and the comparison come from data; the trial is data", () => {
    const p = read("app/(marketing)/pricing/page.tsx");
    expect(p).toContain("const lines = [...limitLines(t), ...copy.extras];");
    expect(p).toContain('<PlanMatrix matrix={matrix} caption="Every feature, by plan" />');
    expect(p).toContain("export async function generateMetadata()");
    expect(p).not.toContain("30-day");
    expect(p).not.toContain("live connectors: proper"); // the stale claim
    expect(p).toContain("live sources — a webhook, Azure Blob storage or SharePoint");
  });

  it("the home page, the features page and the sign-up form no longer type the trial length; features shows the same table", () => {
    expect(read("app/(marketing)/page.tsx")).not.toContain("30-day");
    expect(read("app/(marketing)/page.tsx")).toContain("getStartingTrialDays()");
    const f = read("app/(marketing)/features/page.tsx");
    expect(f).not.toContain("30-day");
    expect(f).toContain('<PlanMatrix matrix={matrix} caption="Every feature, by plan" />');
    const r = read("app/(auth)/register/page.tsx");
    expect(r).not.toContain("30-day");
    expect(r).not.toContain("PAID_PLANS");
    expect(r).toContain('fetch("/api/plans")');
  });

  it("the plans API is public, read-only and returns names, prices and the starting trial", () => {
    const a = read("app/api/plans/route.ts");
    expect(a).toContain("export async function GET()");
    expect(a).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/);
    expect(a).toContain('levels.find((l) => l.id === "free")?.trialDays ?? null');
  });

  it("the comparison never draws informational rows and is a server component (no client JS)", () => {
    expect(read("app/lib/features/publicMatrix.ts")).toContain('gates[f.key]?.status === "informational"');
    expect(read("app/(marketing)/PlanMatrix.tsx")).not.toContain('"use client"');
  });
});
