/**
 * Every simulation route that changes or computes something checks the
 * subscription (plan 2026-09-30, the counterpart of tests/mining/route-gating).
 *
 * The Simulator was gated at three entry points out of thirty routes: once you
 * owned a study — or imported a bundle — you could run scenarios, sweeps, a
 * business case and AI assessments whatever your plan said, and three of those
 * AI routes spent tokens with no attempt counted. This is a source-shape test on
 * purpose (see the mining one): enumerating the directory catches the route
 * that was never wired, which is the failure that actually happened.
 *
 * Reading what you already have is deliberately left open, so a downgraded user
 * can still see their studies — each such route is listed with its reason.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API = join(process.cwd(), "app", "api");
const rel = (f: string) => relative(API, f).split(sep).join("/");

function simulationRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) simulationRoutes(full, out);
    else if (name === "route.ts" && /simulation/i.test(rel(full)) && !rel(full).startsWith("admin/")) out.push(full);
  }
  return out;
}
const routes = simulationRoutes(API);

/** GET handlers that only read what the user already has — open on purpose. */
const READ_OPEN: Record<string, string> = {
  "projects/[id]/simulation/studies/route.ts": "lists the project's studies",
  "projects/[id]/simulation/studies/[studyId]/route.ts": "reads one study",
  "projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/run/route.ts": "reads the latest run's results",
  "projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sweep/route.ts": "reads a saved sweep",
  "projects/[id]/simulation/last-run/route.ts": "reads the last run",
  "projects/[id]/simulation/packages/route.ts": "reads the project's packages",
  "projects/[id]/simulation-calendars/route.ts": "lists the project's calendars",
  "projects/[id]/simulation-teams/route.ts": "lists the project's teams",
  "projects/[id]/simulation-teams/fill-skills/route.ts": "reads the fill-skills preview",
  "orgs/[id]/simulation-teams/route.ts": "lists the organisation's master teams",
};

/** The handlers of a route file: [method, body]. */
function handlers(src: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\(/g;
  const starts: { m: string; i: number }[] = [];
  let x: RegExpExecArray | null;
  while ((x = re.exec(src))) starts.push({ m: x[1], i: x.index });
  starts.forEach((s, k) => out.push([s.m, src.slice(s.i, k + 1 < starts.length ? starts[k + 1].i : src.length)]));
  return out;
}

describe("Simulator routes are gated on the subscription", () => {
  it("T5115 - the enumeration finds the simulation routes at all", () => {
    expect(routes.length).toBeGreaterThanOrEqual(25);
    expect(routes.map(rel)).toContain("projects/[id]/simulation/studies/route.ts");
    expect(routes.map(rel)).toContain("simulation/import/route.ts");
  });

  it("T5116 - every handler that is not a listed read-only GET calls gateFeature (directly, or through the route's own guard())", () => {
    const ungated: string[] = [];
    for (const f of routes) {
      const src = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      const guardGates = /async function guard\([\s\S]*?gateFeature\(/.test(src);
      for (const [method, body] of handlers(src)) {
        if (method === "GET" && READ_OPEN[rel(f)]) continue;
        const gated = /gateFeature\(/.test(body) || (guardGates && /\bguard\(/.test(body));
        if (!gated) ungated.push(`${method} ${rel(f)}`);
      }
    }
    expect(ungated, `these simulation handlers do no subscription check:\n  ${ungated.join("\n  ")}`).toEqual([]);
  });

  it("T5117 - the read-only list is honest: every entry exists, has a GET, and gates nothing that would have to be listed", () => {
    for (const [r, why] of Object.entries(READ_OPEN)) {
      expect(routes.map(rel), `${r} is listed but no longer exists`).toContain(r);
      const src = readFileSync(join(API, r), "utf8");
      expect(/export\s+async\s+function\s+GET\(/.test(src), `${r} has no GET`).toBe(true);
      expect(why.length, `${r} needs a real reason`).toBeGreaterThan(10);
    }
  });

  it("T5118 - and the check can fail — a handler with no gate is detected", () => {
    const fake = `export async function POST(req: Request) {\n  return Response.json({});\n}\n`;
    const [[method, body]] = handlers(fake);
    expect(method).toBe("POST");
    expect(/gateFeature\(/.test(body)).toBe(false);
  });

  it("T5119 - the three AI narrations count against the AI attempts limit and fall back to the deterministic summary at it", () => {
    for (const r of ["assess", "business-case", "next-steps"]) {
      const src = readFileSync(join(API, "projects/[id]/simulation/studies/[studyId]", r, "route.ts"), "utf8").replace(/\r\n/g, "\n");
      expect(src, r).toContain('(await gateLimit(session?.user?.id ?? "", "aiAttempts")) === null');
      expect(src, r).toContain('await recordUsage(session.user.id, "aiAttempts")');
    }
  });

  it("T5120 - the sub-features gate their own routes (analysis, BPSim, calendars, teams, examples), the mining ones theirs", () => {
    const has = (file: string, key: string) => readFileSync(join(API, file), "utf8").includes(`"${key}"`);
    expect(has("projects/[id]/simulation/studies/[studyId]/scenarios/[scenarioId]/sweep/route.ts", "simulator-analysis")).toBe(true);
    expect(has("simulation/import/route.ts", "simulator-bpsim")).toBe(true);
    expect(has("projects/[id]/simulation-calendars/route.ts", "simulator-calendars")).toBe(true);
    expect(has("orgs/[id]/simulation-teams/route.ts", "simulator-teams")).toBe(true);
    expect(has("simulation-examples/route.ts", "simulator-examples")).toBe(true);
    expect(has("projects/[id]/mining/runs/[runId]/conformance/route.ts", "process-mining-conformance")).toBe(true);
    expect(has("projects/[id]/mining/sources/route.ts", "process-mining-sources")).toBe(true);
    expect(has("projects/[id]/mining/runs/[runId]/explain/route.ts", "process-mining-ai")).toBe(true);
    expect(has("projects/[id]/mining/runs/[runId]/export/route.ts", "process-mining-export")).toBe(true);
  });
});

describe("T5121 - the module keys stay; the sub-features need them", () => {
  it("each new feature requires its module, in the registry", async () => {
    const { FEATURE_DEF } = await import("@/app/lib/features/registry");
    for (const k of ["simulator-analysis", "simulator-bpsim", "simulator-calendars", "simulator-teams", "simulator-examples"]) {
      expect(FEATURE_DEF[k].requires, k).toEqual(["simulator"]);
    }
    for (const k of ["process-mining-conformance", "process-mining-sources", "process-mining-alerts", "process-mining-twin", "process-mining-ai", "process-mining-export", "process-mining-examples"]) {
      expect(FEATURE_DEF[k].requires, k).toEqual(["processMining"]);
    }
  });

  it("the seed gives each sub-feature exactly its module's states (so today's access is unchanged), and the prod SQL does the same without overwriting", () => {
    const seed = JSON.parse(readFileSync("menus_and_features/feature-availability.seed.json", "utf8")) as { rows: { key: string; states: Record<string, string> }[] };
    const row = (k: string) => seed.rows.find((r) => r.key === k)!;
    for (const k of ["simulator-analysis", "simulator-bpsim", "simulator-calendars", "simulator-teams"]) expect(row(k).states, k).toEqual(row("simulator").states);
    for (const k of ["process-mining-conformance", "process-mining-sources", "process-mining-alerts", "process-mining-twin", "process-mining-ai", "process-mining-export"]) expect(row(k).states, k).toEqual(row("processMining").states);
    const sql = readFileSync("scripts/sql/patch-simulation-mining-subfeatures.sql", "utf8").replace(/\r\n/g, "\n");
    expect(sql).toContain('ON CONFLICT ("levelId", "featureKey") DO NOTHING;');
    expect(sql).toContain("p.\"state\"");
    expect(sql).not.toMatch(/^\s*(UPDATE|DELETE)\s/m);
    expect(sql.match(/\('(?:simulator|processMining)',\s+'[a-z-]+'\)/g)?.length).toBe(10);
  });
});
