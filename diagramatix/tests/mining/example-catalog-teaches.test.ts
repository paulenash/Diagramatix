/**
 * Phase 11 — does the catalog actually TEACH what it claims to?
 *
 * `example-data-shape.test.ts` already checks that every package is well
 * formed. This asks the harder question, which no structural test can: when a
 * reader follows the description, do they see the thing it promised?
 *
 * That is not pedantry. A synthetic log with a random resource column produces
 * a hand-off map with no structure — and a map with no structure reads exactly
 * like a process with no problem. A slicing dimension whose values are
 * distributed evenly teaches the reader which control to click and nothing
 * else, then leaves them believing the answer was already on the screen. Both
 * failures look like a working example in every screenshot.
 *
 * So each example is mined here by the real functions, and the property it was
 * built to demonstrate is pinned as a number. If a future tweak to the
 * generator flattens the signal, this goes red rather than the example quietly
 * becoming a tour of empty tabs.
 */
import { describe, it, expect } from "vitest";
import data from "@/app/lib/mining/miningExampleData.json";
import { buildEventLog } from "@/app/lib/mining/parseEventLog";
import { computeAnalytics, type RunAnalytics } from "@/app/lib/mining/analytics";
import { filterAnalytics } from "@/app/lib/mining/filterAnalytics";
import { transitionRows } from "@/app/lib/mining/handover";
import { computeTeamFlow, reworkFrom } from "@/app/lib/mining/teamFlow";
import { pingPongFromVariants } from "@/app/lib/mining/taskMining/insights";
import { checkTransitionConformance } from "@/app/lib/mining/transitionConformance";
import { compareRuns, type ComparableRun } from "@/app/lib/mining/compareRuns";
import { evaluateAlerts } from "@/app/lib/mining/alerts";
import { alertPointsFrom } from "@/app/lib/mining/alertHistory";
import type { LogMapping, Variant } from "@/app/lib/mining/types";
import type { DiagramData } from "@/app/lib/diagram/types";

const HOUR = 3_600_000;

interface SampleLog { headers: string[]; rows: string[][]; mapping: LogMapping; runName?: string; scenario?: string }
interface Example {
  slug: string;
  description: string;
  package: {
    sampleLog?: SampleLog;
    sampleLogs?: SampleLog[];
    diagrams: { key: string; data: DiagramData }[];
  };
}
const examples = (data as unknown as { examples: Example[] }).examples;

function example(slug: string): Example {
  const ex = examples.find((e) => e.slug === slug);
  expect(ex, `the catalog no longer contains "${slug}"`).toBeTruthy();
  return ex!;
}

function mine(s: SampleLog) {
  const log = buildEventLog(s.headers, s.rows, s.mapping);
  return { log, analytics: computeAnalytics(log), variants: log.variants };
}

/** The median wait leading into whichever step matches, in hours. */
function waitBefore(analytics: RunAnalytics | null, re: RegExp): number | null {
  const row = transitionRows(analytics?.edges).rows.find((r) => re.test(r.to));
  return row ? Math.round(row.medianMs / HOUR) : null;
}

// ── Purchase Requisition — three teams ──────────────────────────────────────

describe("Phase 11 — the three-team hand-off example", () => {
  const { analytics, variants } = mine(example("three-team-handover").package.sampleLog!);
  const flow = computeTeamFlow(analytics, variants);

  it("T3965 - the hand-off map is MEASURED, not approximated from dominant teams", () => {
    // An approximate map is wrong exactly where it matters — on activities more
    // than one team performs — and an example that teaches an approximation is
    // worse than no example.
    expect(flow.basis).toBe("exact");
  });

  it("T3966 - one hand-off dominates the elapsed time, and it is Finance → Legal", () => {
    const top = flow.handovers[0];
    expect(`${top.from} → ${top.to}`).toBe("Finance → Legal");
    // Dominant, not merely first: at least three times the next one, or the
    // reader has to be told which row to look at.
    expect(top.totalGapMs).toBeGreaterThan(flow.handovers[1].totalGapMs * 3);
  });

  it("T3967 - the team that causes the delay is NOT the team doing the work", () => {
    // The whole point of the example. Legal holds a small share of the recorded
    // time and sits behind the largest wait in the process — a queue, which is
    // invisible in any model that only shows which steps exist.
    const legal = flow.loads.find((l) => l.team === "Legal")!;
    const procurement = flow.loads.find((l) => l.team === "Procurement")!;
    expect(legal.share).toBeLessThan(0.15);
    expect(procurement.share).toBeGreaterThan(legal.share * 3);
  });

  it("T3968 - there is exactly one ping-pong pair, and most cases do not bounce", () => {
    // A process that naturally alternates between two teams registers every
    // case as ping-pong, and the figure then means nothing. The happy path here
    // visits each team once and never returns, so a bounce is a finding.
    expect(flow.pingPong).toHaveLength(1);
    const [pp] = flow.pingPong;
    expect([pp.a, pp.b].sort()).toEqual(["Finance", "Legal"]);
    const allCases = variants.reduce((s, v) => s + v.count, 0);
    expect(pp.cases).toBeGreaterThan(20);
    expect(pp.cases, "if most cases bounce, bouncing is the process").toBeLessThan(allCases * 0.6);
  });
});

// ── Credit Application — rework on a business log ───────────────────────────

describe("Phase 11 — the rework example, and the correction it exists to prove", () => {
  const { analytics, variants } = mine(example("credit-check-rework").package.sampleLog!);

  it("T3969 - the credit check repeats, and the rate is quotable", () => {
    const top = reworkFrom(variants)[0];
    expect(top.activity).toBe("Credit Check");
    expect(top.perCase).toBeGreaterThan(2);
    expect(top.cases).toBeGreaterThan(100);
  });

  it("T3970 - the task-mining ping-pong detector returns ZERO on this log", () => {
    // This is the Capability Review's ext-6 claim, settled. `reworkFrom` is
    // label-agnostic and finds the repeats above; `pingPongFromVariants` reads
    // app names out of "Switch to X" / "Open X" labels and finds nothing here,
    // because nothing here is a UI step. Widening its trigger rather than
    // replacing it would have shipped a confident zero on every business log.
    expect(pingPongFromVariants(variants)).toBe(0);
    // And the replacement, over teams rather than apps, does find something.
    expect(computeTeamFlow(analytics, variants).pingPong.length).toBeGreaterThan(0);
  });

  it("T3971 - the waiting is on the applicant, not on the bank", () => {
    // "Request Documents → Receive Documents" is days of somebody else's life.
    // An example where all the delay is internal teaches that every bottleneck
    // is yours to fix, which is the commonest wrong conclusion in this field.
    const wait = waitBefore(analytics, /Receive Documents/);
    expect(wait).not.toBeNull();
    expect(wait!).toBeGreaterThan(48);
  });
});

// ── Order-to-Cash — the slicing dimensions ─────────────────────────────────

describe("Phase 11 — Order-to-Cash slices to a cause", () => {
  const ex = example("order-to-cash-lifecycle");
  const { analytics, variants } = mine(ex.package.sampleLog!);

  it("T3972 - both slicing columns survive the import", () => {
    // Retention is opt-in, so a column not named in `attributeMode` is dropped
    // and the example imports looking perfectly healthy with an empty filter
    // bar. That failure has no symptom anywhere else.
    const names = (analytics.attributes ?? []).map((a) => a.name).sort();
    expect(names).toEqual(["Channel", "Region"]);
    expect((analytics.attributes ?? []).every((a) => a.filterable)).toBe(true);
  });

  it("T3973 - a name and a unique number are deliberately NOT kept", () => {
    // The example should not teach that identifying columns are retained by
    // default, and a filter that matches values exactly cannot slice by an
    // amount no two orders share.
    const names = (analytics.attributes ?? []).map((a) => a.name);
    expect(names).not.toContain("Customer");
    expect(names).not.toContain("Amount");
  });

  it("T3974 - slicing by Region CHANGES the answer, which is the entire lesson", () => {
    // A dimension that does not move the number teaches the mechanic and
    // nothing else. EMEA carries a fulfilment backlog; the other two regions
    // are unremarkable, and the whole-run figure is the average of a problem
    // and two non-problems.
    const emea = filterAnalytics(analytics, variants, { attrs: { Region: "EMEA" } });
    const apac = filterAnalytics(analytics, variants, { attrs: { Region: "APAC" } });
    const whole = waitBefore(analytics, /Fulfil Order|Ship Goods/)!;
    const emeaWait = waitBefore(emea!.analytics, /Fulfil Order|Ship Goods/)!;
    const apacWait = waitBefore(apac!.analytics, /Fulfil Order|Ship Goods/)!;
    expect(emeaWait).toBeGreaterThan(apacWait * 2);
    expect(whole).toBeGreaterThan(apacWait);
    expect(whole).toBeLessThan(emeaWait);
  });

  it("T3975 - the control failures concentrate in one channel, without belonging to it", () => {
    const bypasses = (chan: string) => {
      const f = filterAnalytics(analytics, variants, { attrs: { Channel: chan } })!;
      return f.variants.filter((v: Variant) => !v.events.includes("Run Credit Check"))
        .reduce((s: number, v: Variant) => s + v.count, 0);
    };
    const partner = bypasses("Partner");
    const direct = bypasses("Direct");
    expect(partner).toBeGreaterThan(direct * 3);
    // But NOT all of them. A dimension that splits the log perfectly makes the
    // slice a tautology rather than a finding.
    expect(direct + bypasses("Web")).toBeGreaterThan(0);
  });
});

// ── Accounts Payable — the comparison example ──────────────────────────────

describe("Phase 11 — Accounts Payable is the comparison example", () => {
  const ex = example("accounts-payable-invoice-lifecycle");
  const reference = ex.package.diagrams.find((d) => d.key === "ap-reference")!.data;

  /** The three periods, oldest first, as the Compare view would see them. */
  const points: ComparableRun[] = (ex.package.sampleLogs ?? []).map((s, i) => {
    const { analytics, variants } = mine(s);
    return {
      id: `p${i}`,
      name: s.runName ?? `Period ${i}`,
      createdAt: new Date(Date.UTC(2025, i * 6, 1)).toISOString(),
      analytics,
      variants,
      conformance: checkTransitionConformance(variants, reference),
    };
  });

  it("T3976 - conformance genuinely improves across the three periods", () => {
    expect(points).toHaveLength(3);
    const f = points.map((p) => p.conformance!.fitness);
    expect(f[0]).toBeLessThan(f[1]);
    expect(f[1]).toBeLessThan(f[2]);
    // And by enough to be the point of the example rather than noise.
    expect(f[2] - f[0]).toBeGreaterThan(0.3);
  });

  it("T3977 - the three periods are COMPARABLE — the same process, not three processes", () => {
    // If the vocabulary overlap fell below the floor, the example's own runs
    // would be refused by the panel it was written to demonstrate.
    const cmp = compareRuns(points[0], points[2]);
    expect(cmp.ok, cmp.refusal ?? "").toBe(true);
    expect(cmp.overlap).toBeGreaterThan(0.6);
    expect(cmp.clearedViolations.length).toBeGreaterThan(3);
  });

  it("T3978 - imported in the other order it fires REAL alerts, at the real thresholds", () => {
    // The point of putting this here rather than tuning the live demo: the
    // alert this example raises is one the shipped rules genuinely raise. An
    // example that fires because a threshold was lowered for the demo teaches
    // the reader something false about when they would be told.
    //
    // NOTE WHAT DECIDES THE DIRECTION, because this test found it. A series is
    // ordered by when each run was MINED, not by the period its log covers —
    // `fitnessHistory` sorts on `createdAt`. So the alert follows the order the
    // analyst imported in: current month first, then the old one, and the
    // watcher reports a fall. That is exactly the demo the description asks
    // for. It is also a real trap for anyone back-filling history, and it is
    // recorded as a known gap rather than papered over here.
    const worsened = evaluateAlerts({
      now: new Date(),
      source: null,
      history: alertPointsFrom([
        { ...points[2], createdAt: "2026-06-01T00:00:00Z", kpiConfig: null },
        { ...points[0], createdAt: "2026-06-02T00:00:00Z", kpiConfig: null },
      ]),
    });
    const kinds = worsened.alerts.map((a) => a.kind);
    expect(kinds).toContain("fitness-drop");
    expect(kinds).toContain("new-deviation");
  });

  it("T3979 - and improving does NOT fire one", () => {
    // Half of a watcher's credibility is what it stays quiet about.
    const improved = evaluateAlerts({
      now: new Date(),
      source: null,
      history: alertPointsFrom([
        { ...points[0], kpiConfig: null },
        { ...points[2], kpiConfig: null },
      ]),
    });
    expect(improved.alerts.filter((a) => a.kind === "fitness-drop")).toHaveLength(0);
    expect(improved.alerts.filter((a) => a.kind === "new-deviation")).toHaveLength(0);
  });
});

// ── The descriptions are claims, and claims can go stale ───────────────────

describe("Phase 11 — the descriptions do not out-run the data", () => {
  it("T3980 - every slug the catalog promises is present exactly once", () => {
    const slugs = examples.map((e) => e.slug);
    for (const expected of [
      "accounts-payable-invoice-lifecycle",
      "order-to-cash-lifecycle",
      "service-desk-ticket-lifecycle",
      "three-team-handover",
      "credit-check-rework",
      "live-order-processing",
    ]) {
      expect(slugs.filter((s) => s === expected), `${expected} is missing or duplicated`).toHaveLength(1);
    }
  });

  it("T3981 - the rework example's quoted rate matches what the log measures", () => {
    // A description is the only part of an example a reader believes without
    // checking, so a figure written into one is pinned to the log that
    // produces it — the generator's mix can be tuned, but not silently.
    const ex = example("credit-check-rework");
    const quoted = ex.description.match(/about ([0-9.]+)× per application/);
    expect(quoted, "the description no longer quotes a per-application rate").toBeTruthy();
    const { variants } = mine(ex.package.sampleLog!);
    const measured = reworkFrom(variants).find((r) => r.activity === "Credit Check")!.perCase;
    expect(Math.abs(measured - Number(quoted![1]))).toBeLessThan(0.15);
  });
});
