/**
 * The V25.05 layout defects (Paul, 2026-08-31).
 *
 * Six faults in one generated diagram, and four of them are the same mistake:
 * the layout measured a SHAPE where the renderer draws a shape PLUS a label.
 * An event's name hangs below it, a data object's name hangs below it, and a
 * connector label auto-sizes to its text — so every clearance decision made
 * against a nominal 80px column was made against a number that never reaches
 * the screen.
 *
 *   1. An edge-mounted intermediate event's exit target was dropped straight
 *      below the host, outside the lane, with a bare vertical connector.
 *   2. Data-object labels were drawn through the tasks beneath them.
 *   3. Both branches of a two-way gateway left the diamond from one vertex.
 *   4. An event's label inside an expanded subprocess hung through its floor.
 *   5. Two message labels on the same pool were drawn on top of each other.
 *
 * These pin the behaviour, not the pixel: each asserts the property Paul asked
 * for rather than a coordinate, so a future layout change is free to move things
 * as long as the diagram stays readable.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import { recomputeAllConnectors } from "@/app/lib/diagram/routing";
import { externalLabelBox, connectorLabelWidth, hasExternalLabel } from "@/app/lib/diagram/textMetrics";

/** A retry loop guarded by a timer, the shape that produced every fault. */
const els: AiElement[] = [
  { id: "p", type: "pool", label: "Organisation", poolType: "white-box", lanes: [{ id: "ln", name: "Analytics Engineering" }] },
  { id: "tool", type: "pool", label: "Transformation Tooling", poolType: "black-box", isSystem: true },
  { id: "s", type: "start-event", label: "Dataset received", pool: "p", lane: "ln" },
  { id: "t1", type: "task", label: "Review Profiled Dataset and Define Scope", pool: "p", lane: "ln" },
  { id: "t2", type: "task", label: "Trigger Transformation Job", taskType: "service", pool: "p", lane: "ln" },
  { id: "ie", type: "intermediate-event", label: "Transformation job result received", eventType: "message", pool: "p", lane: "ln" },
  { id: "gw", type: "gateway", label: "Transformation job succeeded?", gatewayType: "exclusive", pool: "p", lane: "ln" },
  { id: "ep", type: "subprocess-expanded", label: "Repeat Until Transformation Passes", pool: "p", lane: "ln", repeatType: "loop" },
  { id: "eps", type: "start-event", label: "", parentSubprocess: "ep" },
  { id: "ep1", type: "task", label: "Diagnose and Fix Transformation Errors", parentSubprocess: "ep" },
  { id: "epie", type: "intermediate-event", label: "Transformation job result received", eventType: "message", parentSubprocess: "ep" },
  { id: "epe", type: "end-event", label: "", parentSubprocess: "ep" },
  { id: "timer", type: "intermediate-event", label: "Max retry period elapsed", eventType: "timer", boundaryHost: "ep", boundarySide: "bottom" },
  { id: "fail", type: "end-event", label: "Transformation failed — escalate to Data Engineering", pool: "p", lane: "ln" },
  { id: "gwm", type: "gateway", label: "Transformation job succeeded?", pool: "p", lane: "ln" },
  { id: "t3", type: "task", label: "Document Transformation Logic", pool: "p", lane: "ln" },
  { id: "e", type: "end-event", label: "Curated dataset ready", pool: "p", lane: "ln" },
  // Long names, so the wrapped label is several lines deep.
  { id: "do1", type: "data-object", label: "Transformation Scope Definition", pool: "p", lane: "ln" },
  { id: "do2", type: "data-object", label: "Transformation Logic and Model Definition", pool: "p", lane: "ln" },
];
const conns: AiConnection[] = [
  { sourceId: "s", targetId: "t1" }, { sourceId: "t1", targetId: "t2" },
  { sourceId: "t2", targetId: "ie" }, { sourceId: "ie", targetId: "gw" },
  { sourceId: "gw", targetId: "ep", label: "No — job failed" },
  { sourceId: "gw", targetId: "gwm", label: "Yes" },
  { sourceId: "ep", targetId: "gwm" },
  { sourceId: "eps", targetId: "ep1" }, { sourceId: "ep1", targetId: "epie" }, { sourceId: "epie", targetId: "epe" },
  { sourceId: "timer", targetId: "fail" },
  { sourceId: "gwm", targetId: "t3" }, { sourceId: "t3", targetId: "e" },
  { sourceId: "t1", targetId: "do1" }, { sourceId: "do1", targetId: "t2" },
  { sourceId: "t2", targetId: "do2" }, { sourceId: "do2", targetId: "t3" },
  { sourceId: "t2", targetId: "tool", type: "message", label: "Transformation job execution request" },
  { sourceId: "tool", targetId: "ie", type: "message", label: "Job completion status and run log" },
];

const out = layoutBpmnDiagram(els, conns);
const at = (id: string) => out.elements.find((e) => e.id === id)!;
const conn = (s: string, t: string) => (out.connectors as any[]).find((c) => c.sourceId === s && c.targetId === t)!;
const laneOf = () => at("ln");
const EV_H = 36;
const overlap = (a: any, b: any) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
  Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
const boxOf = (e: any) => ({ x: e.x, y: e.y, w: e.width, h: e.height });

describe("V25.05 — an edge-mounted event's exit target (R7.07)", () => {
  it("T3025 — the target is placed to the RIGHT of the event and clear of the mounted edge", () => {
    const ev = at("timer"), tgt = at("fail");
    expect(tgt.x, "target must sit right of the event, not under it").toBeGreaterThanOrEqual(ev.x + ev.width);
    // Bottom-mounted, so the target is below the rim as well as right of it.
    expect(tgt.y + tgt.height / 2).toBeGreaterThan(ev.y + ev.height);
  });

  it("T3026 — the connector is an L: it turns exactly once", () => {
    const w = conn("timer", "fail").waypoints as { x: number; y: number }[];
    let bends = 0;
    for (let i = 1; i < w.length - 1; i++) {
      if (Math.abs(w[i - 1].x - w[i + 1].x) > 1 && Math.abs(w[i - 1].y - w[i + 1].y) > 1) bends++;
    }
    expect(bends, "a bare vertical drop has no bend; an L has one").toBe(1);
  });

  it("T3027 — the target sits FULLY inside the event's lane", () => {
    const lane = laneOf(), tgt = at("fail");
    expect(tgt.y).toBeGreaterThanOrEqual(lane.y);
    expect(tgt.y + tgt.height).toBeLessThanOrEqual(lane.y + lane.height);
  });

  it("T3028 — its label sits to the RIGHT of it, never above where the host is", () => {
    const tgt = at("fail");
    expect((tgt.properties as any).labelOffsetX, "label centre must be right of the shape").toBeGreaterThan(0);
  });

  it("T3029 — a re-route reproduces the same path, so the shape is the router's own answer", () => {
    // Paul: "re-routing undoes this connector placement". It did, because a
    // target directly below made a straight drop the correct route — any hand
    // drawn L was non-canonical and was recomputed away. With the target placed
    // down AND right, the L IS what the router produces.
    const before = out.connectors as any[];
    const after = recomputeAllConnectors(structuredClone(before), out.elements) as any[];
    const path = (c: any) => c.waypoints.map((p: any) => Math.round(p.x) + "," + Math.round(p.y)).join(" ");
    const i = before.findIndex((c) => c.sourceId === "timer");
    expect(path(after[i])).toBe(path(before[i]));
  });

  it("T3030 — a TOP-mounted event puts its target above the rim instead", () => {
    const topEls = els.map((e) => (e.id === "timer" ? { ...e, boundarySide: "top" as const } : e));
    const o = layoutBpmnDiagram(topEls, conns);
    const ev = o.elements.find((e) => e.id === "timer")!;
    const tgt = o.elements.find((e) => e.id === "fail")!;
    expect(tgt.x).toBeGreaterThanOrEqual(ev.x + ev.width);
    expect(tgt.y + tgt.height / 2, "top-mounted exits upward").toBeLessThan(ev.y);
  });
});

describe("V25.05 — labels are measured as the renderer draws them", () => {
  it("T3031 — a data object's wrapped label clears every body below it", () => {
    for (const id of ["do1", "do2"]) {
      const d = at(id);
      const box = externalLabelBox(d as any)!;
      expect(box, "a named data object has a label box").toBeTruthy();
      for (const o of out.elements) {
        if (o.id === d.id || o.y <= d.y) continue;
        if (!["task", "subprocess-expanded", "start-event", "end-event", "intermediate-event", "gateway", "data-object"].includes(o.type)) continue;
        expect(overlap(box, boxOf(o)), `"${d.label}" label lands on "${o.label}"`).toBe(false);
      }
    }
  });

  it("T3032 — an event's label inside an expanded subprocess stays within the box", () => {
    const ep = at("ep");
    for (const ch of out.elements.filter((e) => e.parentId === ep.id && e.type.includes("event"))) {
      const box = externalLabelBox(ch as any);
      if (!box) continue;
      expect(box.y + box.h, `"${ch.label}" label hangs through the EP floor`).toBeLessThanOrEqual(ep.y + ep.height + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(ep.y - 0.5);
    }
  });

  it("T3033 — externalLabelBox counts WRAPPED lines, not hard newlines", () => {
    // The bug this replaces: `split("\n").length` measured a four-line wrapped
    // name as one line, so the clearance pass could not see the overlap.
    const el = { type: "data-object", x: 0, y: 0, width: 36, height: 46, label: "Transformation Logic and Model Definition" };
    const box = externalLabelBox(el)!;
    expect(box.h, "four wrapped lines at 14px").toBeGreaterThanOrEqual(4 * 14);
  });

  it("T3034 — a task's label is INSIDE its box, so it has no external label", () => {
    // Guards the other direction: treating a task's name as external would
    // inflate every container that holds one.
    expect(hasExternalLabel("task")).toBe(false);
    expect(externalLabelBox({ type: "task", x: 0, y: 0, width: 100, height: 60, label: "Anything" })).toBeNull();
    expect(hasExternalLabel("end-event")).toBe(true);
    expect(hasExternalLabel("gateway", { gatewayRole: "merge" }), "a merge gateway shows no label").toBe(false);
  });

  it("T3035 — connectorLabelWidth reports the RENDERED width, not the stored column", () => {
    const w = connectorLabelWidth("Job completion status and run log");
    expect(w, "far wider than the nominal 80px column").toBeGreaterThan(150);
  });
});

describe("V25.05 — a decision gateway's two branches (R6.26 / R8.26)", () => {
  it("T3036 — the branches leave from DIFFERENT vertices: top and bottom", () => {
    const a = conn("gw", "ep"), b = conn("gw", "gwm");
    expect(new Set([a.sourceSide, b.sourceSide]), "both left the diamond from one point").toEqual(new Set(["top", "bottom"]));
  });

  it("T3037 — the branch's subprocess is placed on the side its branch leaves from", () => {
    const gw = at("gw"), ep = at("ep");
    const gcy = gw.y + gw.height / 2;
    const side = conn("gw", "ep").sourceSide;
    if (side === "top") expect(ep.y + ep.height, "a top branch's EP sits above the gateway centre").toBeLessThanOrEqual(gcy + 1);
    else expect(ep.y, "a bottom branch's EP sits below the gateway centre").toBeGreaterThanOrEqual(gcy - 1);
  });

  it("T3056 — a branch label does not sit ON its own horizontal segment", () => {
    // Paul 3(c): the label must read clearly above or below the line, not
    // across it. R3.07 offsets it from the vertex the branch leaves by, so this
    // holds only while the vertex and the label agree — which is why it is
    // pinned alongside the vertex rule rather than trusted to stay true.
    for (const c of out.connectors as any[]) {
      if (!String(c.label ?? "").trim()) continue;
      if (at(c.sourceId)?.type !== "gateway") continue;
      const w = c.waypoints as { x: number; y: number }[];
      const lw = c.labelWidth ?? 60;
      const anchor = c.labelAnchor === "source"
        ? w[0]
        : { x: (w[0].x + w[w.length - 1].x) / 2, y: (w[0].y + w[w.length - 1].y) / 2 };
      const lb = { x: anchor.x + (c.labelOffsetX ?? 0) - lw / 2, y: anchor.y + (c.labelOffsetY ?? 0) - 7, w: lw, h: 14 };
      for (let i = 0; i < w.length - 1; i++) {
        if (Math.abs(w[i].y - w[i + 1].y) > 1) continue;
        const x1 = Math.min(w[i].x, w[i + 1].x), x2 = Math.max(w[i].x, w[i + 1].x);
        if (x2 - x1 < 20) continue;
        expect(overlap(lb, { x: x1, y: w[i].y - 1, w: x2 - x1, h: 2 }),
          `label "${c.label}" is drawn across its own connector`).toBe(false);
      }
    }
  });

  it("T3038 — no horizontal segment runs closer than ¾ of an event height to a lane edge", () => {
    const lane = laneOf();
    for (const c of out.connectors as any[]) {
      const w = c.waypoints ?? [];
      for (let i = 0; i < w.length - 1; i++) {
        if (Math.abs(w[i].y - w[i + 1].y) > 1) continue;
        if (Math.abs(w[i].x - w[i + 1].x) < 40) continue;
        for (const edge of [lane.y, lane.y + lane.height]) {
          const gap = Math.abs(w[i].y - edge);
          if (gap <= 0.5) continue;   // exactly on the edge is a different rule
          expect(gap, `"${c.label ?? ""}" runs ${gap.toFixed(1)}px from a lane edge`).toBeGreaterThanOrEqual(0.75 * EV_H);
        }
      }
    }
  });
});

describe("V25.05 — message-flow labels on the same pool (R05.09)", () => {
  it("T3039 — two labels on one black-box pool do not overlap", () => {
    // They were judged 132px apart against a nominal 80px width and left at the
    // same height; measured properly they are 228px and 210px wide.
    const msgs = (out.connectors as any[]).filter((c) => c.type === "messageBPMN" && String(c.label ?? "").trim());
    expect(msgs.length).toBeGreaterThanOrEqual(2);
    const box = (c: any) => {
      const w = c.waypoints;
      const vs = c.sourceInvisibleLeader ? 1 : 0;
      const ve = c.targetInvisibleLeader ? w.length - 2 : w.length - 1;
      const vis = w.slice(vs, ve + 1);
      const ax = (vis[0].x + vis[vis.length - 1].x) / 2;
      const ay = (vis[0].y + vis[vis.length - 1].y) / 2;
      const width = connectorLabelWidth(c.label);
      return { x: ax + (c.labelOffsetX ?? 0) - width / 2, y: ay + (c.labelOffsetY ?? 0), w: width, h: 14 };
    };
    for (let i = 0; i < msgs.length; i++) {
      for (let j = i + 1; j < msgs.length; j++) {
        expect(overlap(box(msgs[i]), box(msgs[j])),
          `"${msgs[i].label}" and "${msgs[j].label}" are drawn on top of each other`).toBe(false);
      }
    }
  });
});
