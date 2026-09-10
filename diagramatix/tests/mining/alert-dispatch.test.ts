/**
 * Phase 10 — saying it once.
 *
 * `alerts.ts` decides what is worth saying. This decides whether to say it
 * again, and that is what determines whether the channel is still read in a
 * month: a cron that repeats "conformance is 71%" every hour has told nobody
 * anything since the first time, and has taught them to skip the next message —
 * which will be the one that mattered.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MiningAlert } from "@/app/lib/mining/alerts";

interface Row { userId: string; type: string; payload: Record<string, unknown>; createdAt: Date }
const rows: Row[] = [];
let readThrows = false;
let writeThrows = false;
/** The clock the fake store stamps rows with. The tests run at a fixed future
 *  instant, so stamping rows with the REAL clock puts every one of them outside
 *  the look-back window and nothing is ever suppressed — which looked exactly
 *  like a broken de-duplicator. */
let clock = new Date("2026-11-01T12:00:00Z");

vi.mock("@/app/lib/db", () => ({
  prisma: {
    notification: {
      findMany: async ({ where }: { where: { userId: string; createdAt?: { gte: Date } } }) => {
        if (readThrows) throw new Error("db down");
        return rows.filter((r) => r.userId === where.userId && (!where.createdAt || r.createdAt >= where.createdAt.gte));
      },
      create: async ({ data }: { data: Row }) => {
        if (writeThrows) throw new Error("db down");
        rows.push({ ...data, createdAt: new Date(clock) });
        return data;
      },
    },
  },
}));

const { dispatchAlerts, REANNOUNCE_AFTER_DAYS } = await import("@/app/lib/mining/alertDispatch");

const now = new Date("2026-11-01T12:00:00Z");
const alert = (over: Partial<MiningAlert> = {}): MiningAlert => ({
  kind: "fitness-drop", severity: "error",
  title: "Conformance fell from 94% to 71%",
  detail: "Between October and November.", ...over,
});
const target = { userId: "u1", runId: "run-1", projectId: "p1" };

beforeEach(() => { rows.length = 0; readThrows = false; writeThrows = false; clock = new Date(now); });

describe("Phase 10 — a condition is announced once", () => {
  it("T3936 - the first time, it is sent", async () => {
    const r = await dispatchAlerts([alert()], target, now);
    expect(r.sent).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("mining-alert");
    expect(rows[0].payload.runId).toBe("run-1");
    expect(rows[0].payload.alertKey).toBeTruthy();
  });

  it("T3937 - the same standing condition is NOT sent again", async () => {
    await dispatchAlerts([alert()], target, now);
    const r = await dispatchAlerts([alert()], target, now);
    expect(r.sent).toBe(0);
    expect(r.suppressed).toBe(1);
    expect(rows).toHaveLength(1);
  });

  it("T3938 - a condition that WORSENS is announced again", async () => {
    // 94→71 and 94→50 are different messages. Suppressing the second because it
    // is "the same kind of alert" would hide the thing getting worse.
    await dispatchAlerts([alert()], target, now);
    const r = await dispatchAlerts([alert({ title: "Conformance fell from 94% to 50%" })], target, now);
    expect(r.sent).toBe(1);
    expect(rows).toHaveLength(2);
  });

  it("T3939 - the same condition on a DIFFERENT run is its own message", async () => {
    await dispatchAlerts([alert()], target, now);
    const r = await dispatchAlerts([alert()], { ...target, runId: "run-2" }, now);
    expect(r.sent).toBe(1);
  });

  it("T3940 - a standing condition is re-announced after the window", async () => {
    // Something wrong for a fortnight that nobody has acted on is worth raising
    // again; a channel that never repeats lets a real problem age out of view.
    await dispatchAlerts([alert()], target, now);
    const later = new Date(now.getTime() + (REANNOUNCE_AFTER_DAYS + 1) * 86_400_000);
    const r = await dispatchAlerts([alert()], target, later);
    expect(r.sent).toBe(1);
  });

  it("T3941 - several alerts in one pass are each judged separately", async () => {
    await dispatchAlerts([alert()], target, now);
    const r = await dispatchAlerts(
      [alert(), alert({ kind: "new-deviation", title: "A deviation appeared that was not there before" })],
      target, now,
    );
    expect(r.sent).toBe(1);
    expect(r.suppressed).toBe(1);
  });

  it("T3942 - a duplicate inside ONE pass is not sent twice", async () => {
    const r = await dispatchAlerts([alert(), alert()], target, now);
    expect(r.sent).toBe(1);
    expect(r.suppressed).toBe(1);
  });
});

describe("Phase 10 — when it cannot do its job", () => {
  it("T3943 - no recipient is counted, not silently dropped", async () => {
    // A source whose creator was deleted still generates alerts and has nobody
    // to tell. The cron's own report should show that rather than looking clean.
    const r = await dispatchAlerts([alert()], { ...target, userId: null }, now);
    expect(r.sent).toBe(0);
    expect(r.undeliverable).toBe(1);
    expect(rows).toHaveLength(0);
  });

  it("T3944 - nothing to say costs nothing", async () => {
    const r = await dispatchAlerts([], target, now);
    expect(r).toEqual({ sent: 0, suppressed: 0, undeliverable: 0 });
  });

  it("T3945 - if the history cannot be read, it ANNOUNCES rather than staying silent", async () => {
    // A duplicate message is a smaller failure than a missed one.
    readThrows = true;
    const r = await dispatchAlerts([alert()], target, now);
    expect(r.sent).toBe(1);
  });

  it("T3946 - a write that fails is counted and does not throw into the cron", async () => {
    // This runs beside the refresh that produced the data; a notification is not
    // worth failing a poll over.
    writeThrows = true;
    const r = await dispatchAlerts([alert()], target, now);
    expect(r.sent).toBe(0);
    expect(r.undeliverable).toBe(1);
  });
});

describe("Phase 10 — the loop watches what it could not see before", () => {
  it("T3947 - every auto-refresh source is watched, not just the pollable kinds", async () => {
    // The single highest-value line in the phase. The loop used to select only
    // webhook and azure-blob, so a SharePoint feed that died was invisible; and
    // it short-circuited on `if (hasNew)`, so "nothing new" — precisely what the
    // silence alarm watches for — did nothing at all.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/mining/poll/route.ts", "utf8");
    expect(src).toMatch(/findMany\(\{\s*where: \{ autoRefresh: true \}/);
    expect(src).not.toMatch(/kind: \{ in: \["webhook", "azure-blob"\] \}/);
    // Watching happens outside the hasNew branch.
    expect(src.indexOf("evaluateAlerts(")).toBeGreaterThan(src.indexOf("if (hasNew)"));
    expect(src).toMatch(/Watch, whether or not anything arrived/);
  });
});
