import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * A CI failure must leave evidence.
 *
 * 2026-09-04: two CI runs failed with one line between them —
 *
 *     Error: Timed out waiting 300000ms from config.webServer.
 *
 * and nothing else. No test had run; the app never came up. The build output
 * that would have named the cause was thrown away, because the webServer was
 * configured `stdout: "ignore"`, so the whole log held Postgres container
 * teardown and a Node deprecation notice. Diagnosing it took reading the Azure
 * job's token expiry and comparing run DURATIONS to work out that GitHub's
 * runners were simply at half speed — the code was fine both times.
 *
 * Two faults, and a source-text tripwire for each, in the idiom of
 * `route-protection.test.ts`. These are cheap to reinstate by accident: both
 * settings look like noise reduction, and their cost only shows up on the day
 * something breaks.
 *
 * Paul, 2026-09-04, on the same principle applied to truncated prompts: no
 * silent failures.
 */
const ROOT = process.cwd();
const CONFIG = fs.readFileSync(path.join(ROOT, "playwright.config.ts"), "utf8");
const SERVER = fs.readFileSync(path.join(ROOT, "scripts", "e2e-server.cjs"), "utf8");

/** The `webServer: { … }` block, so a `stdout` elsewhere in the file is not read as this one. */
function webServerBlock(): string {
  const start = CONFIG.indexOf("webServer:");
  expect(start, "playwright.config.ts must configure a webServer").toBeGreaterThan(-1);
  return CONFIG.slice(start, CONFIG.indexOf("},", start) + 2);
}

describe("the e2e server reports why it failed", () => {
  it("T3211 does not discard the webServer's output", () => {
    const block = webServerBlock();
    // `ignore` is the setting that made the original failure undiagnosable.
    expect(block, 'webServer.stdout must not be "ignore" — that is what hid the build failure')
      .not.toMatch(/stdout:\s*["']ignore["']/);
    expect(block).toMatch(/stdout:\s*["']pipe["']/);
    expect(block).toMatch(/stderr:\s*["']pipe["']/);
  });

  it("T3212 gives the server long enough that runner load is not a red build", () => {
    // The command does db-push + seed + a full Next build before it answers, so
    // this budget covers all of it. A timeout that turns a slow runner into a
    // failing build teaches people to ignore failing builds — while still being
    // short enough to catch a genuine hang.
    const block = webServerBlock();
    const m = block.match(/timeout:\s*([\d_]+)/);
    expect(m, "webServer.timeout must be set explicitly").not.toBeNull();
    expect(Number(m![1].replace(/_/g, ""))).toBeGreaterThanOrEqual(600_000);
  });

  it("T3213 times each step, so a timeout says WHICH step was slow", () => {
    // Playwright can only report that the budget expired. Without per-step
    // timings there is no way to tell a slow build from a stuck migration.
    expect(SERVER).toMatch(/done in \$\{took\}/);
    expect(SERVER).toMatch(/FAILED after \$\{took\}/);
  });

  it("T3214 still aborts on a failed step rather than serving a broken build", () => {
    // The pre-existing behaviour this must not regress: without it the script
    // would run `next start` over a failed build and hang until the timeout,
    // which is the same silent failure by a different route.
    expect(SERVER).toMatch(/process\.exit\(r\.status \?\? 1\)/);
  });
});
