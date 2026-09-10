/**
 * Phase 11 — the cold start.
 *
 * A user who opens the Miner on their own project has adopted no catalog
 * example, so `builtInSample` is null and — until this phase — the screen showed
 * a file picker and nothing else. The fix is one CSV served from `public/` and
 * a button that loads it.
 *
 * That fix has a failure mode with no symptom in any other test: the file gets
 * renamed, moved, or dropped from the image, the button 404s, and the only
 * person who finds out is a first-time user who quietly leaves. `SAMPLE_LOG` is
 * a string, and a string that has stopped pointing at anything still compiles,
 * still renders and still looks right in a diff.
 *
 * So these tests resolve the ADVERTISED path on disk and mine what they find
 * there, rather than checking that a constant exists.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SAMPLE_LOG } from "@/app/components/mining/console/shared";
import { parseCsv, guessMapping, buildEventLog } from "@/app/lib/mining/parseEventLog";

/** The served path, resolved to the file `public/` would serve for it. */
const onDisk = () => join(process.cwd(), "public", SAMPLE_LOG.path.replace(/^\//, ""));

describe("Phase 11 — the sample log the cold start offers", () => {
  it("T3948 - the advertised path resolves to a real file", () => {
    const file = onDisk();
    expect(existsSync(file), `${SAMPLE_LOG.path} is offered by the import screen but nothing is served for it`).toBe(true);
    expect(readFileSync(file, "utf8").length).toBeGreaterThan(1000);
  });

  it("T3949 - it maps itself, so the sample is one click and not a mapping exercise", () => {
    // The whole value of a cold-start sample is that it needs no decisions. A
    // log whose columns `guessMapping` cannot name would put the newcomer in
    // front of the mapping screen, which is the thing they came to be shown
    // AFTER seeing a process, not before.
    const csv = parseCsv(readFileSync(onDisk(), "utf8"));
    const map = guessMapping(csv.headers);
    expect(map.caseId).toBeTruthy();
    expect(map.activity).toBeTruthy();
    expect(map.timestamp).toBeTruthy();
  });

  it("T3950 - it mines into something worth looking at", () => {
    const csv = parseCsv(readFileSync(onDisk(), "utf8"));
    const log = buildEventLog(csv.headers, csv.rows, guessMapping(csv.headers));
    // Enough cases for the charts to mean anything, and more than one path —
    // a single-variant log discovers a straight line and teaches nothing.
    expect(log.stats.cases).toBeGreaterThan(100);
    expect(log.stats.variants).toBeGreaterThan(3);
  });

  it("T3951 - it carries the columns the workbench needs to say anything", () => {
    // A resource column (the hand-off and team views) and at least one spare
    // column (something to slice by). Without them the sample opens a workbench
    // where half the tabs correctly report that they have nothing to show.
    const csv = parseCsv(readFileSync(onDisk(), "utf8"));
    const map = guessMapping(csv.headers);
    expect(map.resource, "no resource column — the team and hand-off views would be empty").toBeTruthy();
    const claimed = new Set(Object.values(map).filter((v): v is string => typeof v === "string"));
    const spare = csv.headers.filter((h) => !claimed.has(h));
    expect(spare.length, "no spare columns — nothing to slice the sample by").toBeGreaterThan(0);
  });

  it("T3952 - the import screen offers it WITHOUT an adopted example", () => {
    // The defect being fixed, stated as a check. The built-in button renders
    // only when `builtInSample` is set; the sample button must render on the
    // opposite condition, or the cold start is still a bare file picker.
    const src = readFileSync("app/components/mining/console/ImportPanel.tsx", "utf8");
    expect(src).toContain("SAMPLE_LOG");
    expect(src).toMatch(/!builtInSample[\s\S]{0,400}Try it with a sample log/);
    // And the path is taken from the constant the tests above resolve — a
    // second, hardcoded copy in the panel is how the two drift apart.
    const literals = src.match(/["'`]\/mining\/[^"'`]+["'`]/g) ?? [];
    expect(literals, `ImportPanel hardcodes a sample path: ${literals.join(", ")}`).toHaveLength(0);
  });
});
