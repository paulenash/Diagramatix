/**
 * T5270 — examples-only plans (Paul, 2026-10-06): Free may adopt the first Simulator / Mining example only, Introductory the first
 * three, the rest shown greyed; neither plan may enter the Simulator or Process Mining except on an adopted example of that kind.
 * Also: Simple Process runs 21,600 minutes (15 days) per scenario; a single study keeps Root diagrams and Scenarios open.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  exampleAccessForLevel, isExampleLocked, mayEnterOnProject, UNRESTRICTED,
} from "@/app/lib/features/exampleAccess";
import { canEnter } from "@/app/hooks/useExampleAccess";

const read = (p: string) => readFileSync(p, "utf8");

describe("T5270 the rule", () => {
  it("Free gets one example of each set, Introductory three, every other plan all", () => {
    expect(exampleAccessForLevel("free")).toEqual({ examplesOnly: true, allowed: 1 });
    expect(exampleAccessForLevel("introductory")).toEqual({ examplesOnly: true, allowed: 3 });
    for (const l of ["professional", "expert", "enterprise", null, undefined, "something-new"]) expect(exampleAccessForLevel(l)).toEqual(UNRESTRICTED);
  });
  it("the first N are open, the rest locked; nothing is locked when unrestricted", () => {
    const free = exampleAccessForLevel("free"), intro = exampleAccessForLevel("introductory");
    expect([0, 1, 2, 3].map((i) => isExampleLocked(free, i))).toEqual([false, true, true, true]);
    expect([0, 1, 2, 3, 4].map((i) => isExampleLocked(intro, i))).toEqual([false, false, false, true, true]);
    expect(isExampleLocked(UNRESTRICTED, 99)).toBe(false);
  });
  it("the Simulator opens only on a simulation example and Process Mining only on a mining example — for a restricted plan", () => {
    const free = exampleAccessForLevel("free");
    expect(mayEnterOnProject(free, "simulator", "simulation")).toBe(true);
    expect(mayEnterOnProject(free, "simulator", null)).toBe(false);
    expect(mayEnterOnProject(free, "simulator", "mining")).toBe(false);
    expect(mayEnterOnProject(free, "processMining", "mining")).toBe(true);
    expect(mayEnterOnProject(free, "processMining", "simulation")).toBe(false);
    expect(mayEnterOnProject(free, "processMining", undefined)).toBe(false);
    expect(mayEnterOnProject(UNRESTRICTED, "simulator", null)).toBe(true);
    expect(mayEnterOnProject(free, "riskControl", null)).toBe(true);      // other features are not part of this rule
  });
  it("the browser's copy of the rule agrees", () => {
    const free = { examplesOnly: true, allowed: 1 };
    expect(canEnter(free, "simulator", "simulation")).toBe(true);
    expect(canEnter(free, "simulator", null)).toBe(false);
    expect(canEnter(free, "processMining", "simulation")).toBe(false);
    expect(canEnter({ examplesOnly: false, allowed: null }, "processMining", null)).toBe(true);
  });
});

describe("T5270 the rule is wired", () => {
  it("every Simulator / Process Mining entry route under a project passes the project to the gate", () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) { walk(p); continue; }
        if (e !== "route.ts") continue;
        const src = read(p);
        for (const m of src.matchAll(/gateFeature\([^)]*"(simulator|processMining)"([^)]*)\)/g)) if (!/,\s*(id|projectId)$/.test(m[2].trim() ? m[2].trim() : "")) bad.push(`${p}: ${m[0]}`);
      }
    };
    walk("app/api/projects/[id]");
    expect(bad).toEqual([]);
  });
  it("gateFeature refuses an examples-only plan off an example project", () => {
    const src = read("app/lib/subscription-route.ts");
    expect(src).toContain("mayEnterOnProject(access, feature, p?.exampleType)");
    expect(src).toContain("examplesOnly: true");
  });
  it("both galleries' APIs mark locked examples and both adopt routes refuse them", () => {
    for (const f of ["app/api/simulation-examples/route.ts", "app/api/mining-examples/route.ts"]) {
      expect(read(f)).toContain("locked: isExampleLocked(access, i)");
      expect(read(f)).toContain("orderBy: EXAMPLE_ORDER");
    }
    expect(read("app/api/simulation-examples/[id]/adopt/route.ts")).toContain('isExampleLockedFor(session.user.id, "simulation"');
    expect(read("app/api/mining-examples/[id]/adopt/route.ts")).toContain('isExampleLockedFor(session.user.id, "mining"');
  });
  it("the galleries grey a locked example and drop its Load", () => {
    for (const f of ["app/(dashboard)/dashboard/simulator-examples/ExamplesGallery.tsx", "app/(dashboard)/dashboard/mining-examples/MiningExamplesGallery.tsx"]) {
      const s = read(f);
      expect(s).toContain("opacity-40 grayscale");
      expect(s).toContain("Not in your plan");
      expect(s).toContain("?.locked ? undefined");
    }
  });
  it("the editor, the Project screen and the Dashboard project menu disable the entry points", () => {
    expect(read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx")).toContain("disabled={!simEnterAllowed}");
    const proj = read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx");
    expect(proj).toContain("disabled={!simEnterAllowed}");
    expect(proj).toContain("disabled={!miningEnterAllowed}");
    expect(read("app/(dashboard)/dashboard/DashboardClient.tsx")).toContain('disabled={!canEnter(exampleAccess, "processMining", p.exampleType)}');
  });
});

describe("T5270 Simple Process horizon and the study manager", () => {
  it("both scenarios of Simple Process run 21,600 minutes in the committed data and both seed scripts", () => {
    const data = JSON.parse(read("app/lib/simulation/exampleData.json")) as { examples: { slug: string; package: { scenarios: { runConfig: { horizon: number } }[] } }[] };
    const sp = data.examples.find((e) => e.slug === "simple-process")!;
    expect(sp.package.scenarios.map((s) => s.runConfig.horizon)).toEqual([21600, 21600]);
    for (const f of ["scripts/seed-simulation-examples.sql", "scripts/update-sim-examples.sql"]) {
      const line = read(f).split("\n").find((l) => l.includes('"study":{"name":"Simple Process"'))!;
      expect(line.match(/"horizon":21600/g)?.length).toBe(2);
      expect(line).not.toContain('"horizon":2880');
    }
  });
  it("the live-catalog patch is one guarded UPDATE, no inserts or deletes", () => {
    const sql = read("scripts/sql/patch-sim-example-simple-process-horizon-2026-10-06.sql");
    const code = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
    expect((code.match(/^UPDATE "SimulationExample"/gm) ?? []).length).toBe(1);
    expect(code).toContain("e.slug = 'simple-process'");
    expect(code).not.toMatch(/^\s*(INSERT|DELETE\s+FROM|DROP\s+|TRUNCATE\s+)/im);
  });
  it("a single study is selected and cannot be collapsed", () => {
    const s = read("app/components/simulation/StudyManager.tsx");
    expect(s).toContain("const onlyStudyId = studies.length === 1 ? studies[0].id : null;");
    expect(s).toContain("if (onlyStudyId && selectedId !== onlyStudyId) setSelectedId(onlyStudyId);");
    expect(s).toContain("if (!onlyStudyId) setSelectedId(");
  });
});
