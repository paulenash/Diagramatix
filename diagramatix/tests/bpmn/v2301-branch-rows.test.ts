/**
 * V23.01 — the paths between a decision and its merge (Paul, 2026-08-31).
 *
 * Three faults with one origin. R55 fans a decision's immediate branch targets
 * onto separate rows, but only those: everything further along each branch was
 * placed by the column engine at its lane's own centre band, so the chains drift
 * back toward the middle and interleave.
 *
 *   (a) R55 set the target's `y` directly, leaving its edge-mounted events
 *       behind — they looked unattached and sprang back to the rim on a drag.
 *   (b) A branch's later steps abandoned the row the branch started on.
 *   (c) Which made branches CROSS: a merge assigns its incoming sides by source
 *       Y, so once the top branch's last element had drifted below the bottom
 *       branch's, the two swapped sides at the join.
 *
 * Plus (d): two tasks in the same column sent their message flows down the same
 * vertical line, one drawn over the other.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";

const els: AiElement[] = [
  { id: "p", type: "pool", label: "Utility", poolType: "white-box", lanes: [{ id: "ln", name: "Meter Field Ops" }] },
  { id: "mdm", type: "pool", label: "Meter Data Management System", poolType: "black-box", isSystem: true },
  { id: "s", type: "start-event", label: "Billing cycle due", pool: "p", lane: "ln" },
  { id: "gw", type: "gateway", label: "Read source?", gatewayType: "exclusive", pool: "p", lane: "ln" },

  // Branch 1 — three steps, so the row has somewhere to drift to.
  { id: "a1", type: "task", label: "Request Interval Data From Head-End", taskType: "service", pool: "p", lane: "ln" },
  { id: "a2", type: "intermediate-event", label: "Interval Data Received", eventType: "message", pool: "p", lane: "ln" },
  { id: "a3", type: "task", label: "Review Automated Read Completeness", pool: "p", lane: "ln" },
  // A data object feeding a3: its association is typed "sequence" in a plan, and
  // must NOT be mistaken for a second inbound FLOW, which would stop the row.
  { id: "dobj", type: "data-object", label: "Interval Data File", pool: "p", lane: "ln" },

  // Branch 2 — carries an edge-mounted event, the (a) case.
  { id: "b1", type: "task", label: "Schedule Field Technician Visit", pool: "p", lane: "ln" },
  { id: "bnd", type: "intermediate-event", label: "Visit overdue", eventType: "timer", boundaryHost: "b1", boundarySide: "bottom" },
  { id: "bEsc", type: "end-event", label: "Escalate to supervisor", pool: "p", lane: "ln" },
  { id: "b2", type: "task", label: "Record Manual Meter Read", pool: "p", lane: "ln" },

  // Branch 3 — also three steps, and its first task talks to the system pool.
  { id: "c1", type: "task", label: "Send Self-Read Request To Consumer", taskType: "service", pool: "p", lane: "ln" },
  { id: "c2", type: "intermediate-event", label: "Self-Read Submitted By Consumer", eventType: "message", pool: "p", lane: "ln" },
  { id: "c3", type: "task", label: "Record Consumer Self-Read", pool: "p", lane: "ln" },

  { id: "gwm", type: "gateway", label: "Read source", pool: "p", lane: "ln" },
  { id: "t9", type: "task", label: "Submit Reads", pool: "p", lane: "ln" },
  { id: "e", type: "end-event", label: "Reads acquired", pool: "p", lane: "ln" },
];

const conns: AiConnection[] = [
  { sourceId: "s", targetId: "gw" },
  { sourceId: "gw", targetId: "a1", label: "Smart meter" },
  { sourceId: "gw", targetId: "b1", label: "Manual read" },
  { sourceId: "gw", targetId: "c1", label: "Consumer self-read" },
  { sourceId: "a1", targetId: "a2" }, { sourceId: "a2", targetId: "a3" }, { sourceId: "a3", targetId: "gwm" },
  { sourceId: "b1", targetId: "b2" }, { sourceId: "b2", targetId: "gwm" },
  { sourceId: "bnd", targetId: "bEsc" },
  { sourceId: "c1", targetId: "c2" }, { sourceId: "c2", targetId: "c3" }, { sourceId: "c3", targetId: "gwm" },
  { sourceId: "gwm", targetId: "t9" }, { sourceId: "t9", targetId: "e" },
  { sourceId: "dobj", targetId: "a3" },
  // Two flows to the same system pool from tasks that stack in one column.
  { sourceId: "a1", targetId: "mdm", type: "message", label: "Interval data request" },
  { sourceId: "c1", targetId: "mdm", type: "message", label: "Self-read request" },
];

const out = layoutBpmnDiagram(els, conns);
const at = (id: string) => out.elements.find((e) => e.id === id)!;
const cy = (id: string) => { const e = at(id); return e.y + e.height / 2; };
const L = (e: any) => String(e?.label ?? e?.type ?? "?").replace(/\s+/g, " ").slice(0, 32);

describe("V23.01 — a branch holds its row (R55.1)", () => {
  it("T3080 — every step of a branch sits on the row the branch was fanned onto", () => {
    for (const chain of [["a1", "a2", "a3"], ["b1", "b2"], ["c1", "c2", "c3"]]) {
      const rows = chain.map(cy);
      const spread = Math.max(...rows) - Math.min(...rows);
      expect(spread, `branch ${chain.join(" -> ")} drifts across ${spread.toFixed(0)}px: ${rows.map((r) => r.toFixed(0)).join(", ")}`).toBeLessThan(2);
    }
  });

  it("T3081 — the three branches stay on DIFFERENT rows, in a stable order", () => {
    const rows = [cy("a1"), cy("b1"), cy("c1")];
    expect(new Set(rows.map((r) => Math.round(r))).size, "branches share a row").toBe(3);
    // Whatever order they take, the whole chain keeps it — that is what stops
    // the paths crossing on their way into the merge.
    expect(cy("a3") < cy("b2")).toBe(cy("a1") < cy("b1"));
    expect(cy("b2") < cy("c3")).toBe(cy("b1") < cy("c1"));
  });

  it("T3082 — a data association is not mistaken for a second inbound flow", () => {
    // "Interval Data File" -> a3 arrives typed as a sequence in an AI plan. Read
    // as flow it makes a3 look shared, and the row stops one step short.
    expect(Math.abs(cy("a3") - cy("a1")), "a3 did not follow its branch").toBeLessThan(2);
  });

  it("T3083 — an edge-mounted event travels with the task R55 moved", () => {
    // R55 set `y` directly and left boundary events behind; they then looked
    // detached and sprang back to the rim when dragged.
    const host = at("b1"), ev = at("bnd");
    const ecy = ev.y + ev.height / 2;
    const onRim = Math.abs(ecy - host.y) < 2 || Math.abs(ecy - (host.y + host.height)) < 2;
    expect(onRim, `"${L(ev)}" centre ${ecy.toFixed(0)} is off the rim of "${L(host)}" (${host.y.toFixed(0)}..${(host.y + host.height).toFixed(0)})`).toBe(true);
  });
});

describe("V23.01 — message flows do not share a vertical line (R05.10)", () => {
  it("T3084 — two flows from tasks in the same column are separated horizontally", () => {
    const runs: { id: string; x: number; y1: number; y2: number }[] = [];
    for (const c of out.connectors as any[]) {
      if (c.type !== "messageBPMN") continue;
      const w = c.waypoints ?? [];
      for (let i = 0; i < w.length - 1; i++) {
        if (Math.abs(w[i].x - w[i + 1].x) > 1) continue;
        if (Math.abs(w[i].y - w[i + 1].y) < 20) continue;
        runs.push({ id: c.id, x: w[i].x, y1: Math.min(w[i].y, w[i + 1].y), y2: Math.max(w[i].y, w[i + 1].y) });
      }
    }
    expect(runs.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < runs.length; i++) {
      for (let j = i + 1; j < runs.length; j++) {
        if (runs[i].id === runs[j].id) continue;
        const sameX = Math.abs(runs[i].x - runs[j].x) < 6;
        const overlapY = Math.min(runs[i].y2, runs[j].y2) - Math.max(runs[i].y1, runs[j].y1) > 0;
        expect(sameX && overlapY,
          `two message flows share x=${runs[i].x.toFixed(0)} over the same span`).toBe(false);
      }
    }
  });
});

describe("V23.01 — a decision and its merge sit in the middle of their paths (R8.32)", () => {
  it("T3108 — the gateway centres on the path BOUNDARIES, not their centres", () => {
    // Paul's rule (2026-09-01): halfway between the top boundary of the highest
    // path's initial element and the bottom boundary of the lowest path's. With
    // branches of differing heights that is NOT the midpoint of their centres,
    // and the boundary reading is the one that looks centred.
    const gw = at("gw");
    const targets = (out.connectors as any[])
      .filter((c) => c.sourceId === "gw" && c.type !== "messageBPMN" && c.type !== "associationBPMN")
      .map((c) => at(c.targetId));
    expect(targets.length).toBeGreaterThanOrEqual(2);
    const top = Math.min(...targets.map((t) => t.y));
    const bottom = Math.max(...targets.map((t) => t.y + t.height));
    expect(gw.y + gw.height / 2).toBeCloseTo((top + bottom) / 2, 0);
  });

  it("T3109 — the paired merge is on the same line as its decision", () => {
    // R8.01 computed a midpoint BEFORE the paths were given rows, so its answer
    // described a diagram that no longer existed — every gateway in Paul's test
    // sat up to 200px from where its own branches had ended up, and R8.24 then
    // faithfully aligned each merge to that stale row.
    expect(cy("gwm")).toBeCloseTo(cy("gw"), 0);
  });
});
