/**
 * Phase 0.4 — a test floor under `refreshRun.ts`.
 *
 * This is the only code path that changes a run after it was imported, and it
 * runs unattended — on a webhook, on a cron poll, on a manual refresh. Nobody is
 * watching when it goes wrong, which makes the refusals as important as the
 * work: a source with no run, or a mapping that lost its timestamp column, must
 * stop rather than rebuild a run out of nothing.
 *
 * The DB is mocked. The pipeline (buildEventLog, performance, analytics,
 * discovery, conformance) is real — mocking it would leave nothing under test.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LogMapping } from "@/app/lib/mining/types";

const sql: { text: string; values: unknown[] }[] = [];
let runRow: Record<string, unknown> | null = null;
let refDiagram: { data: unknown } | null = null;
const sourceUpdates: Record<string, unknown>[] = [];

vi.mock("@/app/lib/db", () => ({
  pgPool: { query: async (text: string, values: unknown[]) => { sql.push({ text, values }); return { rows: [] }; } },
  prisma: {
    processMiningRun: { findUnique: async () => runRow },
    diagram: { findFirst: async () => refDiagram },
    miningSource: { update: async ({ data }: { data: Record<string, unknown> }) => { sourceUpdates.push(data); return data; } },
  },
}));

const { refreshRunFromSource } = await import("@/app/lib/mining/refreshRun");

const MAPPING: LogMapping = { caseId: "case", activity: "act", timestamp: "ts", state: "st" };
const FIELDS = ["case", "act", "ts", "st"];
const BUFFER = [
  ["c1", "Receive", "2026-02-02T09:00:00Z", "New"],
  ["c1", "Close", "2026-02-02T11:00:00Z", "Done"],
  ["c2", "Receive", "2026-02-03T09:00:00Z", "New"],
  ["c2", "Close", "2026-02-03T10:00:00Z", "Done"],
];

const source = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "src-1", runId: "run-1", name: "Live", headerFields: FIELDS, buffer: BUFFER, mapping: MAPPING, ...over,
}) as Parameters<typeof refreshRunFromSource>[0];

/** The values written to a run column, found via its placeholder. */
function written(column: string): unknown {
  for (const s of sql) {
    if (!s.text.includes('"ProcessMiningRun"')) continue;
    const m = new RegExp(`"?${column}"? = \\$(\\d+)`).exec(s.text);
    if (m) return s.values[Number(m[1]) - 1];
  }
  return undefined;
}
const runWrites = () => sql.filter((s) => s.text.includes('"ProcessMiningRun"'));
const diagramWrites = () => sql.filter((s) => s.text.includes('"Diagram"'));

beforeEach(() => {
  sql.length = 0; sourceUpdates.length = 0;
  runRow = { discoveredBpmnId: null, discoveredSmId: null, referenceSmId: null };
  refDiagram = null;
});

describe("Phase 0.4 — refusing to refresh", () => {
  it("T3735 - a source with no run does nothing at all", async () => {
    expect(await refreshRunFromSource(source({ runId: null }))).toBeNull();
    expect(sql).toHaveLength(0);
    expect(sourceUpdates).toHaveLength(0);
  });

  it("T3736 - a mapping missing a required role refuses rather than rebuilding", async () => {
    // A source whose mapping was edited to drop the timestamp would otherwise
    // rebuild the run with zero usable events and report success.
    for (const broken of [{ activity: "act", timestamp: "ts" }, { caseId: "case", timestamp: "ts" }, { caseId: "case", activity: "act" }]) {
      sql.length = 0;
      expect(await refreshRunFromSource(source({ mapping: broken }))).toBeNull();
      expect(sql).toHaveLength(0);
    }
  });

  it("T3737 - an empty buffer still refuses to touch the diagrams", async () => {
    runRow = { discoveredBpmnId: "bpmn-1", discoveredSmId: "sm-1", referenceSmId: null };
    const out = await refreshRunFromSource(source({ buffer: [] }));
    expect(out).toEqual({ cases: 0, events: 0, variants: 0 });
    expect(diagramWrites()).toHaveLength(0);      // nothing discovered from nothing
  });
});

describe("Phase 0.4 — what a refresh rebuilds", () => {
  it("T3738 - the aggregates are recomputed from the buffer", async () => {
    const out = await refreshRunFromSource(source());
    expect(out).toEqual({ cases: 2, events: 4, variants: 1 });
    expect(JSON.parse(written("stats") as string).cases).toBe(2);
    expect(JSON.parse(written("variants") as string)).toHaveLength(1);
    expect(JSON.parse(written("performance") as string).clockUnit).toBeTruthy();
    expect(JSON.parse(written("analytics") as string).totalCases).toBe(2);
  });

  it("T3739 - kpiConfig is NOT written, so a live refresh cannot clear the SLA", async () => {
    // The rule the old hand-written statement kept by omission, and which the
    // patch helper now keeps by absence. Clearing it would silently turn every
    // outcome report into "no SLA set".
    await refreshRunFromSource(source());
    expect(runWrites().some((s) => s.text.includes("kpiConfig"))).toBe(false);
  });

  it("T3740 - governance is written as NULL when the log has no GRC columns", async () => {
    // Explicitly null, not omitted: a run that USED to carry control ids and no
    // longer does must stop reporting them.
    await refreshRunFromSource(source());
    expect(written("governance")).toBeNull();
  });

  it("T3741 - the source is stamped as refreshed", async () => {
    await refreshRunFromSource(source());
    expect(sourceUpdates[0].lastRefreshAt).toBeInstanceOf(Date);
  });
});

describe("Phase 0.4 — re-discovery only where a diagram already exists", () => {
  it("T3742 - no discovered diagrams means no diagram writes", async () => {
    await refreshRunFromSource(source());
    expect(diagramWrites()).toHaveLength(0);
  });

  it("T3743 - an existing discovered BPMN is rebuilt in place", async () => {
    runRow = { discoveredBpmnId: "bpmn-1", discoveredSmId: null, referenceSmId: null };
    await refreshRunFromSource(source());
    const w = diagramWrites();
    expect(w).toHaveLength(1);
    expect(w[0].values[1]).toBe("bpmn-1");
    expect(JSON.parse(w[0].values[0] as string).elements.length).toBeGreaterThan(0);
  });

  it("T3744 - an existing discovered state machine is rebuilt in place", async () => {
    runRow = { discoveredBpmnId: null, discoveredSmId: "sm-1", referenceSmId: null };
    await refreshRunFromSource(source());
    expect(diagramWrites().map((w) => w.values[1])).toEqual(["sm-1"]);
  });

  it("T3745 - conformance re-runs against the chosen reference, and is persisted", async () => {
    runRow = { discoveredBpmnId: null, discoveredSmId: "sm-1", referenceSmId: "ref-1" };
    // A reference allowing only New → Done: the log conforms.
    refDiagram = { data: {
      elements: [
        { id: "i", type: "initial-state" }, { id: "s1", type: "state", label: "New" },
        { id: "s2", type: "state", label: "Done" }, { id: "f", type: "final-state" },
      ],
      connectors: [
        { id: "t0", sourceId: "i", targetId: "s1", type: "transition" },
        { id: "t1", sourceId: "s1", targetId: "s2", type: "transition" },
        { id: "t2", sourceId: "s2", targetId: "f", type: "transition" },
      ],
    } };
    await refreshRunFromSource(source());
    const conf = JSON.parse(written("conformance") as string);
    expect(conf.totalCases).toBe(2);
    expect(conf.fitness).toBe(1);
  });

  it("T3746 - with no reference chosen, conformance is left alone rather than cleared", async () => {
    // Writing null here would wipe a result the user set deliberately by hand.
    runRow = { discoveredBpmnId: null, discoveredSmId: "sm-1", referenceSmId: null };
    await refreshRunFromSource(source());
    expect(runWrites().some((s) => s.text.includes("conformance"))).toBe(false);
  });
});
