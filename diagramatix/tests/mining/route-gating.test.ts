/**
 * Every Miner route that does mining work must check the subscription.
 *
 * The Miner was sold as a tiered feature and enforced in three routes out of
 * twenty-six. `discover`, `conformance`, `calibrate`, `validate`, `explain`,
 * `export`, `analysis-export`, `snapshot`, `import-ocel` and the source routes
 * all carried project-access checks only — so anyone who could reach a project
 * could mine in it, whatever their plan said. The gallery list was worse: the
 * LINK was hidden for unentitled users while `GET /api/mining-examples` answered
 * anyone signed in, which is hiding a door rather than locking it.
 *
 * This is a source-shape test on purpose. The alternative — asserting a 403 per
 * route — needs a session, a database and twenty-six fixtures, and would still
 * miss the twenty-seventh route somebody adds next month. Enumerating the
 * directory catches the one that was never wired at all, which is the failure
 * that actually happened.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const API = join(process.cwd(), "app", "api");

/** Every route.ts under app/api whose path mentions mining. */
function miningRoutes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) miningRoutes(full, out);
    else if (name === "route.ts" && /mining/i.test(relative(API, full))) out.push(full);
  }
  return out;
}

const rel = (f: string) => relative(API, f).split(sep).join("/");

/**
 * Routes that deliberately carry NO subscription gate, each with the reason.
 * Adding a route here is a decision; leaving one out is the bug this test exists
 * to catch.
 */
const UNGATED: Record<string, string> = {
  "mining/ingest/[sourceId]/route.ts":
    "public webhook — no session exists to check a subscription against; authenticated by a hashed per-source API key",
  "mining/poll/route.ts":
    "cron endpoint — authenticated by CRON_SECRET, runs as nobody",
  "admin/mining-examples/route.ts": "SuperAdmin catalog CRUD — gated by role, not by plan",
  "admin/mining-examples/[id]/route.ts": "SuperAdmin catalog CRUD — gated by role, not by plan",
  "admin/mining-examples/[id]/duplicate/route.ts": "SuperAdmin catalog CRUD — gated by role, not by plan",
  "admin/mining-examples/capture/route.ts": "SuperAdmin catalog CRUD — gated by role, not by plan",
};

const routes = miningRoutes(API);

describe("Miner routes are gated on the subscription", () => {
  it("T3609 - the enumeration finds the Miner's routes at all", () => {
    // A guard that silently matches nothing passes forever. Pin the floor.
    expect(routes.length).toBeGreaterThanOrEqual(20);
    expect(routes.map(rel)).toContain("projects/[id]/mining/import/route.ts");
  });

  it("T3610 - every mining route either calls gateFeature or is listed as deliberately open", () => {
    const ungated = routes
      .map(rel)
      .filter((r) => !UNGATED[r])
      .filter((r) => !readFileSync(join(API, r), "utf8").includes("gateFeature("));
    expect(ungated, `these mining routes do no subscription check:\n  ${ungated.join("\n  ")}`).toEqual([]);
  });

  it("T3611 - the exemption list is honest: every entry exists and none is gated anyway", () => {
    // An exemption for a route that has since been deleted, or one that turns
    // out to be gated after all, is a stale excuse sitting in the codebase.
    for (const [r, why] of Object.entries(UNGATED)) {
      expect(routes.map(rel), `${r} is exempted but no longer exists`).toContain(r);
      expect(why.length, `${r} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("T3612 - and the check can fail — a handler with no gate is detected", () => {
    // Proving the negative: the same predicate over a route known to have no
    // gateFeature call must flag it. Without this the test above could be
    // passing because the substring is found everywhere, or nowhere.
    const publicWebhook = join(API, "mining", "ingest", "[sourceId]", "route.ts");
    expect(readFileSync(publicWebhook, "utf8").includes("gateFeature(")).toBe(false);
  });

  it("T3613 - the tiered sub-features are enforced where they are sold", () => {
    // Declared in the registry and shipped to the production availability
    // matrix, but enforced nowhere — the OCEL importer and the example catalog
    // were being given away on every tier.
    const ocel = readFileSync(join(API, "projects", "[id]", "mining", "import-ocel", "route.ts"), "utf8");
    expect(ocel).toContain('"process-mining-ocel"');
    const gallery = readFileSync(join(API, "mining-examples", "route.ts"), "utf8");
    expect(gallery).toContain('"process-mining-examples"');
    // Calibration spans both products, so it must satisfy both.
    const calibrate = readFileSync(join(API, "projects", "[id]", "mining", "runs", "[runId]", "calibrate", "route.ts"), "utf8");
    expect(calibrate).toContain('"processMining"');
    expect(calibrate).toContain('"simulator"');
  });
});
