/**
 * Phase 10 — watch it, rather than visit it.
 *
 * The measure of an alerting feature is not what it catches; it is whether the
 * person receiving it still reads the messages in a month. So most of this file
 * is about the alerts that must NOT fire:
 *
 *  - nothing on a first observation, because a process mined once has no trend
 *    and a fitness of 71% is the as-is process rather than a regression;
 *  - nothing on a rise from 1% to 3% late, which is arithmetic doubling and not
 *    an event;
 *  - and every signal that cannot be judged says so by name, because silence
 *    reads as a clean bill.
 */
import { describe, it, expect } from "vitest";
import {
  evaluateAlerts, alertKey, SILENCE_HOURS, FITNESS_DROP, FITNESS_FLOOR, LATE_RATE_FLOOR,
  type AlertPoint, type AlertSource,
} from "@/app/lib/mining/alerts";

const HOUR = 3_600_000;
const now = new Date("2026-11-01T12:00:00Z");
const ago = (h: number) => new Date(now.getTime() - h * HOUR);

const pt = (over: Partial<AlertPoint> = {}): AlertPoint => ({
  runId: "r", name: "run", at: now.toISOString(),
  fitness: 0.95, lateRate: 0.05, violations: [], ...over,
});
const src = (over: Partial<AlertSource> = {}): AlertSource => ({
  name: "Nightly export", kind: "azure-blob",
  lastIngestAt: ago(1), createdAt: ago(1000), autoRefresh: true, ...over,
});
const run = (over: Partial<Parameters<typeof evaluateAlerts>[0]> = {}) =>
  evaluateAlerts({ now, source: src(), history: [pt(), pt()], ...over });

describe("Phase 10 — the cheapest alarm, and the most valuable", () => {
  it("T3917 - a source that has gone quiet is reported", () => {
    // The failure most likely to go unnoticed: a feed that stops produces no
    // error anywhere, and stale figures look exactly like stable ones.
    const r = run({ source: src({ lastIngestAt: ago(SILENCE_HOURS + 5) }) });
    const a = r.alerts.find((x) => x.kind === "source-silent")!;
    expect(a).toBeTruthy();
    expect(a.severity).toBe("error");
    expect(a.title).toContain("Nightly export");
    expect(a.detail).toMatch(/stale figures look exactly like|not moving/);
  });

  it("T3918 - a source that is merely quiet for a few hours is not an incident", () => {
    expect(run({ source: src({ lastIngestAt: ago(SILENCE_HOURS - 1) }) }).alerts.some((a) => a.kind === "source-silent")).toBe(false);
  });

  it("T3919 - a source set up today that has received nothing yet is not an incident", () => {
    // It becomes one a week later — a source configured and forgotten is the
    // commonest way a live dashboard becomes a fossil.
    const young = src({ lastIngestAt: null, createdAt: ago(2) });
    expect(run({ source: young }).alerts.some((a) => a.kind === "source-silent")).toBe(false);

    const old = src({ lastIngestAt: null, createdAt: ago(SILENCE_HOURS * 3) });
    const a = run({ source: old }).alerts.find((x) => x.kind === "source-silent")!;
    expect(a.title).toMatch(/never received/);
  });

  it("T3920 - a run with no live source says silence is not watched, rather than nothing", () => {
    const r = run({ source: null });
    expect(r.alerts.some((a) => a.kind === "source-silent")).toBe(false);
    expect(r.notEvaluated.join(" ")).toMatch(/no live source/);
  });

  it("T3921 - auto-refresh off is a choice, and is named as the reason", () => {
    const r = run({ source: src({ autoRefresh: false, lastIngestAt: ago(1000) }) });
    expect(r.alerts.some((a) => a.kind === "source-silent")).toBe(false);
    expect(r.notEvaluated.join(" ")).toMatch(/auto-refresh is off/);
  });
});

describe("Phase 10 — nothing fires on a first observation", () => {
  it("T3922 - one run means no trend, and it says so by name", () => {
    // THE floor. A fitness of 60% on a first mine is the as-is process; alerting
    // on it teaches the recipient that the alerts are noise.
    const r = run({ history: [pt({ fitness: 0.6, lateRate: 0.9 })] });
    expect(r.alerts.some((a) => a.kind !== "source-silent")).toBe(false);
    expect(r.notEvaluated.join(" ")).toMatch(/mined once/);
    expect(r.notEvaluated.join(" ")).toMatch(/second observation/);
  });

  it("T3923 - an empty history is the same: no trend, no alerts", () => {
    expect(run({ history: [] }).alerts.some((a) => a.kind !== "source-silent")).toBe(false);
  });
});

describe("Phase 10 — conformance", () => {
  it("T3924 - a real fall is reported with both numbers", () => {
    const r = run({ history: [pt({ name: "October", fitness: 0.94 }), pt({ name: "November", fitness: 0.71 })] });
    const a = r.alerts.find((x) => x.kind === "fitness-drop")!;
    expect(a.severity).toBe("error");
    expect(a.title).toContain("94%");
    expect(a.title).toContain("71%");
    expect(a.detail).toContain("October");
  });

  it("T3925 - drift below the threshold is not an event", () => {
    const r = run({ history: [pt({ fitness: 0.95 }), pt({ fitness: 0.95 - (FITNESS_DROP - 0.02) })] });
    expect(r.alerts.some((a) => a.kind === "fitness-drop")).toBe(false);
  });

  it("T3926 - steady-but-low is a WARNING, and says it did not get worse", () => {
    // Distinguishing "this fell" from "this has been bad" is the difference
    // between an incident and a standing problem.
    const low = FITNESS_FLOOR - 0.1;
    const a = run({ history: [pt({ fitness: low }), pt({ fitness: low })] }).alerts.find((x) => x.kind === "fitness-drop")!;
    expect(a.severity).toBe("warning");
    expect(a.detail).toMatch(/did not get worse/);
  });

  it("T3927 - an unchecked run means conformance is not judged, and says which", () => {
    const r = run({ history: [pt({ fitness: null }), pt({ fitness: 0.5 })] });
    expect(r.alerts.some((a) => a.kind === "fitness-drop")).toBe(false);
    expect(r.notEvaluated.join(" ")).toMatch(/never checked against a reference/);
  });
});

describe("Phase 10 — a deviation nobody had seen before", () => {
  it("T3928 - a new violation is reported; a persisting one is not", () => {
    // The one that already existed is not news, and repeating it every period is
    // how an alert channel becomes wallpaper.
    const r = run({
      history: [
        pt({ violations: ["Undocumented transition: New → Done"] }),
        pt({ violations: ["Undocumented transition: New → Done", "State \"Escalated\" is not in the reference"] }),
      ],
    });
    const a = r.alerts.find((x) => x.kind === "new-deviation")!;
    expect(a.detail).toContain("Escalated");
    expect(a.detail).not.toContain("New → Done");
  });

  it("T3929 - many new deviations are counted and the list is trimmed", () => {
    const many = ["a", "b", "c", "d", "e"];
    const a = run({ history: [pt({ violations: [] }), pt({ violations: many })] }).alerts.find((x) => x.kind === "new-deviation")!;
    expect(a.title).toContain("5");
    expect(a.detail).toMatch(/and 2 more/);
  });

  it("T3930 - a deviation that went AWAY is not an alert", () => {
    const r = run({ history: [pt({ violations: ["gone"] }), pt({ violations: [] })] });
    expect(r.alerts.some((x) => x.kind === "new-deviation")).toBe(false);
  });
});

describe("Phase 10 — the late rate", () => {
  it("T3931 - more than double, and material, is reported", () => {
    const a = run({ history: [pt({ lateRate: 0.1 }), pt({ lateRate: 0.25 })] }).alerts.find((x) => x.kind === "late-rate-doubled")!;
    expect(a.title).toContain("10%");
    expect(a.title).toContain("25%");
  });

  it("T3932 - doubling a trivial rate is arithmetic, not an event", () => {
    // 1% → 3% is a tripling and nothing happened.
    const r = run({ history: [pt({ lateRate: 0.01 }), pt({ lateRate: 0.03 })] });
    expect(r.alerts.some((x) => x.kind === "late-rate-doubled")).toBe(false);
    expect(LATE_RATE_FLOOR).toBeGreaterThan(0.03);
  });

  it("T3933 - the first late cases are a change of state, not an infinite multiple", () => {
    const a = run({ history: [pt({ name: "clean", lateRate: 0 }), pt({ lateRate: 0.2 })] }).alerts.find((x) => x.kind === "late-rate-doubled")!;
    expect(a.title).toContain("20%");
    expect(a.detail).toMatch(/Nothing was late/);
  });

  it("T3934 - no SLA means the late rate is not watched, and says so", () => {
    const r = run({ history: [pt({ lateRate: null }), pt({ lateRate: null })] });
    expect(r.alerts.some((x) => x.kind === "late-rate-doubled")).toBe(false);
    expect(r.notEvaluated.join(" ")).toMatch(/no SLA is set/);
  });
});

describe("Phase 10 — the same condition is announced once", () => {
  it("T3935 - the key is stable across evaluations of an unchanged condition", () => {
    const a = run({ history: [pt({ fitness: 0.94 }), pt({ fitness: 0.71 })] }).alerts.find((x) => x.kind === "fitness-drop")!;
    const b = run({ history: [pt({ fitness: 0.94 }), pt({ fitness: 0.71 })] }).alerts.find((x) => x.kind === "fitness-drop")!;
    expect(alertKey("run-1", a)).toBe(alertKey("run-1", b));
    // …and differs when the condition does, so a worsening IS announced again.
    const worse = run({ history: [pt({ fitness: 0.94 }), pt({ fitness: 0.5 })] }).alerts.find((x) => x.kind === "fitness-drop")!;
    expect(alertKey("run-1", worse)).not.toBe(alertKey("run-1", a));
  });
});
