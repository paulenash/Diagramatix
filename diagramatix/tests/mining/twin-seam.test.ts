/**
 * Phase 3 — the Miner → Simulator seam.
 *
 * Three shipped, tested capabilities that nothing reached: a hold-back the
 * import route accepts and no screen sent, a `studyId` the calibrate route
 * returns and the caller threw away, and a twin that goes stale in silence.
 *
 * The two pinned here are the ones with logic behind them. Both concern a live
 * refresh, and both used to fail in the same quiet way — the run kept working
 * and the *claim it supports* stopped being true.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import type { LogMapping, Performance } from "@/app/lib/mining/types";

const sql: { text: string; values: unknown[] }[] = [];
let priorRun: Record<string, unknown> | null = null;

vi.mock("@/app/lib/db", () => ({
  pgPool: { query: async (text: string, values: unknown[]) => { sql.push({ text, values }); return { rows: [] }; } },
  prisma: {
    processMiningRun: { findUnique: async () => priorRun },
    diagram: { findFirst: async () => null },
    miningSource: { update: async ({ data }: { data: unknown }) => data },
  },
}));

const { refreshRunFromSource } = await import("@/app/lib/mining/refreshRun");

const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st" };
const FIELDS = ["case", "act", "ts", "st"];

/** Ten cases, one per day, two events each — enough for a 30% split to bite. */
const BUFFER: string[][] = [];
for (let i = 1; i <= 10; i++) {
  const day = String(i).padStart(2, "0");
  BUFFER.push([`c${i}`, "Receive", `2026-03-${day}T09:00:00Z`, "New"]);
  BUFFER.push([`c${i}`, "Close", `2026-03-${day}T11:00:00Z`, "Done"]);
}

const source = () => ({
  id: "src-1", runId: "run-1", name: "Live", headerFields: FIELDS, buffer: BUFFER, mapping: MAPPING,
}) as Parameters<typeof refreshRunFromSource>[0];

/** The performance object written by the refresh. */
function writtenPerformance(): Performance {
  for (const s of sql) {
    const m = /"performance" = \$(\d+)/.exec(s.text);
    if (m) return JSON.parse(s.values[Number(m[1]) - 1] as string) as Performance;
  }
  throw new Error("no performance write");
}

beforeEach(() => { sql.length = 0; priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null, performance: {}, studyId: null }; });

describe("Phase 3 — a refresh keeps the hold-back", () => {
  it("T3763 - a run imported WITH a hold-back still has one after a refresh", () => {
    // The defect: the refresh recomputed performance over every trace, so the
    // hold-back vanished and the twin quietly began marking its own homework —
    // while the validate panel went on reporting whichever answer the (now
    // missing) field implied. The run still worked. The claim stopped being true.
    priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null, studyId: null,
      performance: { holdout: { pct: 0.3, splitMs: 1, cases: 3 } } };
    return refreshRunFromSource(source()).then(() => {
      const perf = writtenPerformance();
      expect(perf.holdout).toBeTruthy();
      expect(perf.holdout!.pct).toBe(0.3);
      expect(perf.holdout!.cases).toBe(3);            // the last 3 of 10, re-split
    });
  });

  it("T3764 - the split is RE-APPLIED to the new log, not copied from the old", () => {
    // Inheriting the old `cases` count would describe a log that no longer
    // exists; the point of the arrangement is that it holds as the log grows.
    priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null, studyId: null,
      performance: { holdout: { pct: 0.2, splitMs: 999, cases: 99 } } };
    return refreshRunFromSource(source()).then(() => {
      const perf = writtenPerformance();
      expect(perf.holdout!.cases).toBe(2);            // 20% of the CURRENT ten
      expect(perf.holdout!.splitMs).not.toBe(999);    // and a fresh split date
    });
  });

  it("T3765 - a run imported without one does not acquire a hold-back", async () => {
    await refreshRunFromSource(source());
    expect(writtenPerformance().holdout).toBeUndefined();
  });
});

describe("Phase 3 — a refresh marks the twin stale", () => {
  it("T3766 - a run with a calibrated twin gets a divergence date", async () => {
    priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null, performance: {}, studyId: "study-1" };
    await refreshRunFromSource(source());
    const at = writtenPerformance().twinStaleAt;
    expect(at).toBeTruthy();
    expect(Number.isNaN(Date.parse(at!))).toBe(false);
  });

  it("T3767 - a run with NO twin is not marked stale", async () => {
    // There is nothing to be stale. A warning here would be noise on every
    // live run that has never been calibrated — which is most of them.
    await refreshRunFromSource(source());
    expect(writtenPerformance().twinStaleAt).toBeUndefined();
  });

  it("T3768 - the FIRST divergence date is kept, not the latest refresh", async () => {
    // What a reader needs is when the twin stopped describing the log, not when
    // the log was last looked at. A date that advances on every poll says
    // "just now" forever and tells them nothing.
    const first = "2026-03-01T00:00:00.000Z";
    priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null,
      performance: { twinStaleAt: first }, studyId: "study-1" };
    await refreshRunFromSource(source());
    expect(writtenPerformance().twinStaleAt).toBe(first);
  });

  it("T3769 - the twin is MARKED, never silently re-calibrated", async () => {
    // Re-calibrating would rewrite a study the user may have edited. Nothing in
    // a refresh may touch the study, so the run's studyId is left exactly alone.
    priorRun = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null, performance: {}, studyId: "study-1" };
    await refreshRunFromSource(source());
    expect(sql.some((s) => /"studyId"/.test(s.text))).toBe(false);
    expect(sql.some((s) => /SimulationStudy/i.test(s.text))).toBe(false);
  });
});

/**
 * The failure this whole phase exists to fix: a capability that is implemented,
 * tested, and reachable by nothing. `holdoutPct` was accepted by the import
 * route, implemented by `splitByTime`, covered by T3503-T3506 — and had zero
 * callers, while the validation panel told users to "re-import the log with a
 * hold-back", which no screen could do. A unit test cannot notice that; only
 * asking whether anything calls it can.
 *
 * Source-text tripwires, in the idiom of `route-gating` and
 * `generate-diagnostics-wired`: these paths need a session, a database and a
 * subscription to exercise, and what actually regresses is somebody refactoring
 * one end and quietly orphaning the other.
 */
const read = (f: string) => readFileSync(f, "utf8");

describe("Phase 3 — the seam is reachable from both ends", () => {
  it("T3770 - the hold-back the import route accepts is actually sent by the importer", () => {
    const route = read("app/api/projects/[id]/mining/import/route.ts");
    const panel = read("app/components/mining/console/ImportPanel.tsx");
    expect(route, "the route still accepts it").toContain("holdoutPct");
    expect(panel, "and the import screen offers it").toContain("holdoutPct");
    // Precisely: the body of the POST to the import route, not merely a
    // mention of the name somewhere in the file.
    const post = panel.slice(panel.indexOf("mining/import"));
    const at = post.indexOf("body: JSON.stringify");
    expect(at, "the importer still POSTs a body").toBeGreaterThan(-1);
    expect(post.slice(at, at + 300), "and puts the hold-back in it").toContain("holdoutPct");
  });

  it("T3771 - the study the calibrate route returns is used by its caller", () => {
    const route = read("app/api/projects/[id]/mining/runs/[runId]/calibrate/route.ts");
    const caller = read("app/components/mining/console/RunDetail.tsx");
    expect(route, "the route still returns it").toMatch(/studyId,\s*diagramId/);
    expect(caller, "and the caller hands it to the Simulator").toMatch(/onOpenSimulator\?\.\(json\.studyId/);
  });

  it("T3772 - the Simulator can be opened ON a study, all the way down", () => {
    // Six files between the Miner's button and the study that gets expanded.
    // A prop dropped anywhere in the middle leaves the user hunting again, and
    // every intermediate file still compiles.
    for (const f of [
      "app/components/mining/ProcessMiningOverlay.tsx",
      "app/components/mining/ProcessMiningConsole.tsx",
      "app/components/simulation/SimulatorOverlay.tsx",
      "app/components/simulation/SimulatorConsole.tsx",
      "app/components/simulation/StudyManager.tsx",
    ]) {
      expect(read(f), f).toMatch(/initialStudyId|studyId\?: string \| null/);
    }
    expect(read("app/(dashboard)/dashboard/DashboardClient.tsx")).toContain("initialStudyId={simStudyId}");
    expect(read("app/(dashboard)/dashboard/projects/[id]/ProjectDetailClient.tsx")).toContain("initialStudyId={simStudyId}");
  });
});
