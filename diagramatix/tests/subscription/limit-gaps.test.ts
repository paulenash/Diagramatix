/**
 * Feature Availability slice 7 (plan 2026-09-30): limits that leaked.
 *   • a project created by clone, an example adoption or an import skipped the project cap;
 *   • POST /api/me/subscription {"tierId":"free"} restarted the trial on every call;
 *   • the server rejected a diagram of EXACTLY the element limit that the editor let you build.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { isOverLimit } from "@/app/lib/subscription";

const read = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const route = (p: string) => read(`app/api/${p}/route.ts`);

describe("T5130 — every way of creating a project counts against the project cap", () => {
  const before = (p: string, anchor: string) => {
    const src = route(p);
    expect(src, `${p} gates the project cap`).toContain('await gateLimit(session.user.id, "projects")');
    expect(src.indexOf('gateLimit(session.user.id, "projects")'), `${p}: before the project is made`).toBeLessThan(src.indexOf(anchor));
  };

  it("clone, the three example adoptions, the simulation import and the bulk Visio import's new project", () => {
    before("projects/[id]/clone", "await prisma.project.create(");
    before("simulation-examples/[id]/adopt", "await adoptPackage(");
    before("risk-control-examples/[id]/adopt", "await adoptRiskControlExample(");
    before("mining-examples/[id]/adopt", "await adoptMiningPackage(");
    before("simulation/import", "await adoptPackage(");
    before("import/visio-v3/bulk", "await prisma.project.create(");
  });

  it("and the original create route still does (nothing regressed)", () => {
    expect(route("projects")).toContain('"projects"');
  });
});

describe("T5131 — the element cap: exactly the limit is allowed, one more is not; counts are blocked AT the limit", () => {
  it("an element count is over only when it EXCEEDS the limit", () => {
    expect(isOverLimit("bpmnElementsPerDiagram", 20, 20)).toBe(false);
    expect(isOverLimit("bpmnElementsPerDiagram", 21, 20)).toBe(true);
    expect(isOverLimit("nonBpmnElementsPerDiagram", 15, 15)).toBe(false);
    expect(isOverLimit("nonBpmnElementsPerDiagram", 16, 15)).toBe(true);
  });

  it("every other metric is blocked AT the limit — the next one would be over", () => {
    for (const m of ["projects", "aiAttempts", "individualExports", "individualImports", "bulkExports", "bulkImports", "archimateDiagramsTotal", "diagramsPerTypePerProject"] as const) {
      expect(isOverLimit(m, 4, 5), m).toBe(false);
      expect(isOverLimit(m, 5, 5), m).toBe(true);
    }
  });

  it("the enforcer and the usage snapshot both use it (they used a bare >=)", () => {
    const src = read("app/lib/subscription.ts");
    expect(src).toContain("if (isOverLimit(metric, current, limit)) {");
    expect(src).toContain("overLimit: limit !== null && isOverLimit(metric, current, limit),");
    expect(src).not.toContain("if (current >= limit) {");
  });
});

describe("T5132 — POST /api/me/subscription no longer restarts the trial", () => {
  const src = route("me/subscription");

  it("a paid subscriber is refused and pointed at Stripe; someone already on Free changes nothing", () => {
    expect(src).toContain("current?.hasChosenTier && current.subscriptionLevelId && current.subscriptionLevelId !== \"free\"");
    expect(src).toContain("Your plan is managed through Stripe.");
    expect(src).toContain("{ status: 409 }");
    expect(src).toContain('if (current?.hasChosenTier && current.subscriptionLevelId === "free") {');
  });

  it("the trial clock is stamped only when it has never been (the first choice), never restamped", () => {
    expect(src).toContain("...(current?.subscriptionAssignedAt ? {} : { subscriptionAssignedAt: new Date() }),");
    expect(src).not.toContain("subscriptionAssignedAt: new Date(),\n      hasChosenTier: true,");
  });
});
