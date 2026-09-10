/**
 * The two items deferred through Phases 4–8, done together because they are the
 * same job: connecting the model to the analysis.
 *
 * DISCOVERY FROM A SLICE is the one with consequences. Every other filtered view
 * in the workbench is a live recalculation that disappears when the filter is
 * cleared. Discovery emits a PERSISTED DIAGRAM that will sit in the project list
 * long after the slice that produced it is forgotten — so it has to be named
 * after its slice, and it must never replace the run's model of the whole log.
 *
 * The route needs a session and a database, so these are source-level tripwires
 * in the idiom this programme has used since Phase 0.1 — plus real tests of the
 * pure slicing the route depends on.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { filterAnalytics, describeFilter, type MiningFilter } from "@/app/lib/mining/filterAnalytics";
import { edgePairKey } from "@/app/lib/mining/handover";
import { discoverProcess } from "@/app/lib/mining/discoverProcess";
import { computeAnalytics } from "@/app/lib/mining/analytics";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import type { LogMapping } from "@/app/lib/mining/types";

const HOUR = 3_600_000, DAY = 86_400_000;
const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", attributeMode: { region: "keep" } };
const HEADERS = ["case", "act", "ts", "region"];

/** North checks before closing; South does not. Two genuinely different paths. */
function run() {
  const rows: string[][] = [];
  const at = (d: number, h: number) => new Date(Date.parse("2026-10-01T00:00:00Z") + d * DAY + h * HOUR).toISOString();
  for (let i = 0; i < 6; i++) {
    rows.push([`n${i}`, "Receive", at(i, 0), "North"]);
    rows.push([`n${i}`, "Check", at(i, 1), "North"]);
    rows.push([`n${i}`, "Close", at(i, 5), "North"]);
  }
  for (let i = 0; i < 6; i++) {
    rows.push([`s${i}`, "Receive", at(6 + i, 0), "South"]);
    rows.push([`s${i}`, "Close", at(6 + i, 1), "South"]);
  }
  const log = buildEventLog(HEADERS, rows, MAPPING);
  return { analytics: computeAnalytics(log), variants: log.variants };
}

/** The variants the route would discover from, for a given filter. */
function sliceVariants(filter: MiningFilter) {
  const { analytics, variants } = run();
  const sliced = filterAnalytics(analytics, variants, filter)!;
  return { sliced, discoverable: sliced.variants.filter((v) => v.count > 0) };
}

describe("Discovery from a slice — what gets discovered", () => {
  it("T3879 - a slice discovers only the paths that slice actually took", () => {
    // South never checks. A model of the South that shows a credit check is not
    // a model of the South.
    const { discoverable } = sliceVariants({ attrs: { region: "South" } });
    const { plan } = discoverProcess(discoverable);
    expect(plan.elements.some((e) => (e.label ?? "").includes("Check"))).toBe(false);
    expect(plan.elements.some((e) => (e.label ?? "").includes("Close"))).toBe(true);
  });

  it("T3880 - zero-count variants are dropped before discovery, not passed through", () => {
    // `filterAnalytics` keeps the array positionally aligned so `variantIdx`
    // stays valid — which is right for counting and wrong for drawing. A variant
    // nobody in the slice followed would otherwise become a path on the diagram.
    const { sliced, discoverable } = sliceVariants({ attrs: { region: "North" } });
    expect(sliced.variants.length).toBeGreaterThan(discoverable.length);
    expect(discoverable.every((v) => v.count > 0)).toBe(true);
  });

  it("T3881 - the whole-log discovery is unchanged by any of this", () => {
    const { variants } = run();
    const { plan } = discoverProcess(variants);
    expect(plan.elements.some((e) => (e.label ?? "").includes("Check"))).toBe(true);
  });

  it("T3882 - a slice matching nothing has no process to discover", () => {
    const { discoverable } = sliceVariants({ attrs: { region: "Nowhere" } });
    expect(discoverable).toEqual([]);
  });

  it("T3883 - the slice's own edges are what would label it", () => {
    // Labelling a filtered model with whole-run timings is the mixed-provenance
    // defect, persisted into a file. North's Check → Close is 4h; the whole run
    // also contains South's 1h Receive → Close, which must not leak in.
    const { sliced } = sliceVariants({ attrs: { region: "North" } });
    const byPair = new Map(sliced.analytics.edges.map((e) => [edgePairKey(e.from, e.to), e]));
    expect(byPair.get(edgePairKey("Check", "Close"))!.medianMs).toBe(4 * HOUR);
    expect(byPair.has(edgePairKey("Receive", "Close"))).toBe(false);
  });
});

describe("Discovery from a slice — the rules the route must keep", () => {
  const src = readFileSync("app/api/projects/[id]/mining/runs/[runId]/discover/route.ts", "utf8");

  it("T3884 - a sliced discovery NEVER becomes the run's own model", () => {
    // The rule with the longest reach: `discoveredBpmnId` is read by the heat
    // map, the transitions map, calibration and the recompute route. Pointing it
    // at a slice would silently narrow every one of them, with nothing on screen
    // saying so.
    expect(src).toMatch(/if \(!sliced\) await prisma\.processMiningRun\.update/);
    const updates = [...src.matchAll(/processMiningRun\.update\(/g)];
    expect(updates).toHaveLength(1);
  });

  it("T3885 - the diagram is named after its slice", () => {
    // It outlives the filter. A model of the Northern region indistinguishable
    // from a model of the whole process is worse than no model.
    expect(src).toMatch(/name: sliced \?/);
    expect(src).toContain("${filterNote}");
  });

  it("T3886 - the slice's own edges label it, not the whole run's", () => {
    expect(src).toMatch(/slice\?\.analytics \?\? analytics/);
  });

  it("T3887 - a run with no case index refuses to slice rather than guessing", () => {
    expect(src).toMatch(/no case index, so it cannot be sliced/);
  });

  it("T3888 - the filter reaches the route from the console", () => {
    // The Phase 3 lesson, applied pre-emptively: a route that accepts a
    // capability nothing sends is a capability that does not exist.
    const panel = readFileSync("app/components/mining/insights/MiningInsightsPanel.tsx", "utf8");
    const post = panel.slice(panel.indexOf("/discover`"));
    const at = post.indexOf("body: JSON.stringify");
    expect(at).toBeGreaterThan(-1);
    expect(post.slice(at, at + 120)).toContain("filter");
  });
});

describe("Arrow ↔ table — the model and the analysis point at each other", () => {
  const panel = readFileSync("app/components/mining/insights/MiningInsightsPanel.tsx", "utf8");

  it("T3889 - only edges the log contains are clickable", () => {
    // The layout inserts gateways and start/end events. They have no measured
    // gap, so a click on one has no row to select and must not pretend to.
    expect(panel).toMatch(/const known = new Set\(rows\.map\(\(r\) => edgePairKey\(r\.from, r\.to\)\)\)/);
    expect(panel).toMatch(/if \(!p \|\| !pts\) return null;/);
  });

  it("T3890 - the picking layer is separate from the shared renderer", () => {
    // `ReplayDiagramBackdrop` is pointer-events:none on purpose and is shared
    // with the Simulator's replay. Making it interactive to serve one tab would
    // reach a long way for a small feature.
    const backdrop = readFileSync("app/components/simulation/replay/ReplayDiagramBackdrop.tsx", "utf8");
    expect(backdrop).toContain('pointerEvents: "none"');
    expect(panel).toMatch(/pointerEvents: "stroke"/);
  });

  it("T3891 - a row selected from the diagram is scrolled into view", () => {
    // A highlight below the fold is the same as no highlight.
    expect(panel).toMatch(/scrollIntoView\(\{ block: "nearest" \}\)/);
  });

  it("T3892 - both directions toggle off, so a mis-click is one click to undo", () => {
    expect(panel).toMatch(/onPick\(same\(p\) \? null : p\)/);
    expect(panel).toMatch(/setSelected\(on \? null : \{ from: r\.from, to: r\.to \}\)/);
  });
});
