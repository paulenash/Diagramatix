/**
 * Phase 5 — the seam's rule, enforced.
 *
 * `useRunView` exists so that no panel reads the fetched analytics directly. The
 * moment one figure on a screen is quietly whole-run while its neighbour is
 * sliced, every number in the workbench becomes uncitable — and nothing about
 * that failure looks like a bug. Both figures render, both are plausible, and
 * only someone who already knew the answer would notice.
 *
 * A unit test cannot catch it, because each panel is individually correct. What
 * can catch it is asking whether any panel was handed the unfiltered data, so
 * that is what this does.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const PANEL = "app/components/mining/insights/MiningInsightsPanel.tsx";
const src = () => readFileSync(PANEL, "utf8");

/**
 * The JSX of `MiningInsightsPanel`'s OWN render — where the tabs are handed
 * their data — and nothing beyond it.
 *
 * Bounded deliberately. A slice that ran to the end of the file flagged
 * `CaseReplay`, which receives `variants` from inside `CasesTab`, where that
 * name is already the view's. The rule is about what the PANEL hands out; once
 * data is inside a tab it has been through the seam by definition.
 */
function renderBody(): string {
  const s = src();
  const start = s.indexOf("export function MiningInsightsPanel");
  expect(start, "the panel was renamed — this guard needs updating").toBeGreaterThan(-1);
  // The function ends at the first closing brace in column 0 after it.
  const end = s.indexOf("\n}\n", start);
  expect(end, "could not find the end of the panel").toBeGreaterThan(start);
  return s.slice(start, end);
}

describe("Phase 5 — every panel reads through the seam", () => {
  it("T3818 - no tab is handed the raw, unfiltered analytics", () => {
    // `analytics={analytics}` is legitimate for exactly one component: the filter
    // bar, whose job is to show the WHOLE run's vocabulary and its unchanging
    // chart. Anywhere else it is a panel that will show whole-run numbers beside
    // filtered ones.
    const body = renderBody();
    const raw = [...body.matchAll(/<(\w+)[^>]*\sanalytics=\{analytics\}/g)].map((m) => m[1]);
    expect(raw).toEqual(["FilterBar"]);
  });

  it("T3819 - no tab is handed the raw, unfiltered variants", () => {
    const body = renderBody();
    expect([...body.matchAll(/<(\w+)[^>]*\svariants=\{variants\}/g)].map((m) => m[1])).toEqual([]);
  });

  it("T3820 - every tab that takes analytics or variants takes the view's", () => {
    // The positive form of the same rule: if a component receives these props at
    // all, they came through the seam.
    const body = renderBody();
    const passes = [...body.matchAll(/<(\w+)[^>]*\s(analytics|variants)=\{([\w.]+)\}/g)];
    expect(passes.length, "the panel stopped passing analytics anywhere — check this guard").toBeGreaterThan(3);
    for (const [, component, prop, value] of passes) {
      if (component === "FilterBar") continue;         // documented exception
      expect(value, `${component} receives ${prop} from outside the seam`).toMatch(/^view\./);
    }
  });

  it("T3821 - the seam is actually given the filter", () => {
    // Without this argument every panel filters by nothing, silently, and the
    // filter bar becomes decorative.
    expect(src()).toMatch(/useRunView\(analytics,\s*variants,\s*filter\)/);
  });
});
