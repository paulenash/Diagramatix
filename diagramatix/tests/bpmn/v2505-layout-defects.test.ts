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
import { externalLabelBox, connectorLabelWidth, connectorLabelLines, CONNECTOR_LABEL_MAX_W, hasExternalLabel } from "@/app/lib/diagram/textMetrics";

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
const L = (e: any) => String(e?.label ?? e?.type ?? "").replace(/\s+/g, " ").slice(0, 34);

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
    // Still the point of this check: the answer must come from the TEXT, never
    // from the nominal 80px column. The bound moved down on 2026-09-03 because
    // a long label is now WRAPPED (Paul: "generated gateway connector labels are
    // very long, they need to be wrapped into 2 lines to localise the overlap
    // problem at the source"), so the rendered width is the widest wrapped line
    // rather than the whole string laid out flat.
    const w = connectorLabelWidth("Job completion status and run log");
    expect(w, "wider than the nominal 80px column").toBeGreaterThan(80);
    expect(w, "but capped by the wrap, not the full single-line sprawl").toBeLessThanOrEqual(CONNECTOR_LABEL_MAX_W);
  });

  it("T3151 — a long label wraps to two balanced lines; a short one is left alone", () => {
    expect(connectorLabelLines("Yes")).toEqual(["Yes"]);
    const lines = connectorLabelLines("No — variance exceeds the agreed threshold");
    expect(lines.length, "a long branch condition should wrap").toBe(2);
    // Balanced, so neither line is a stub — an unbalanced split reads worse
    // than no split at all.
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThan(12);
    expect(lines.join(" ")).toBe("No — variance exceeds the agreed threshold");
    // A single unbreakable word is left whole rather than cut mid-word.
    expect(connectorLabelLines("Supercalifragilisticexpialidocious-and-then-some").length).toBe(1);
  });
});

describe("V25.05 — a decision gateway's two branches (R6.26 / R8.26)", () => {
  it("T3036 — the branches leave from DIFFERENT vertices, never the same one", () => {
    // The invariant that matters, and the defect this was written for: two
    // branches must not leave the diamond from ONE point.
    //
    // The exact pair changed on 2026-09-03. Paul asked for top-then-bottom on
    // 2026-08-31; then, of V22.01: "connector \"Yes — all required details
    // present\" starts on wrong gateway vertex" — both gateways level, and the
    // branch still climbing to the top corner to get there. R6.32 now sends a
    // branch running straight into its MERGE out by the right vertex. The old
    // hazard (both branches reading as level, so both answering "right") is
    // guarded: R6.32 fires only when exactly ONE of the two is level.
    const a = conn("gw", "ep"), b = conn("gw", "gwm");
    expect(new Set([a.sourceSide, b.sourceSide]).size, "both left the diamond from one point").toBe(2);
    expect(b.sourceSide, "the branch straight into its merge takes the right vertex").toBe("right");
    expect(["top", "bottom"], "the fanning branch keeps a corner").toContain(a.sourceSide);
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

describe("V25.05 — event labels are placed against the FINISHED diagram (R8.29)", () => {
  const BODY = new Set(["task", "subprocess-expanded", "start-event", "end-event",
    "intermediate-event", "gateway", "data-object", "data-store"]);
  const labelBox = (e: any) => externalLabelBox(e);
  const anc = (a: any, n: any) => {
    let cur = n;
    for (let i = 0; i < 32 && cur; i++) {
      const nid = cur.boundaryHostId ?? cur.parentId;
      if (!nid) return false;
      if (nid === a.id) return true;
      cur = out.elements.find((x) => x.id === nid);
    }
    return false;
  };

  it("T3060 — no event label is drawn over another element's body", () => {
    for (const e of out.elements) {
      if (!/event/.test(e.type)) continue;
      const box = labelBox(e);
      if (!box) continue;
      for (const ob of out.elements) {
        if (ob.id === e.id || !BODY.has(ob.type)) continue;
        if (anc(ob, e) || anc(e, ob)) continue;
        expect(overlap(box, boxOf(ob)),
          `"${L(e)}" label sits on ${ob.type} "${L(ob)}"`).toBe(false);
      }
    }
  });

  it("T3061 — no event label is drawn across a sequence or message connector", () => {
    // The half that was never checked: R8.16 runs before routing, so a connector
    // could not be an obstacle to it. An end-event label sat on both a gateway
    // and the flow feeding that gateway, and only the gateway was reported.
    for (const e of out.elements) {
      if (!/event/.test(e.type)) continue;
      const box = labelBox(e);
      if (!box) continue;
      for (const c of out.connectors as any[]) {
        if (c.type === "associationBPMN") continue;      // may span the diagram
        if (c.sourceId === e.id || c.targetId === e.id) continue;
        const w = c.waypoints ?? [];
        for (let i = 0; i < w.length - 1; i++) {
          const seg = {
            x: Math.min(w[i].x, w[i + 1].x), y: Math.min(w[i].y, w[i + 1].y),
            w: Math.max(Math.abs(w[i].x - w[i + 1].x), 1.5),
            h: Math.max(Math.abs(w[i].y - w[i + 1].y), 1.5),
          };
          expect(overlap(box, seg), `"${L(e)}" label crosses a connector`).toBe(false);
        }
      }
    }
  });

  it("T3062 — the exit target keeps its label on the RIGHT when the right is clear", () => {
    // R8.29 tries the CURRENT offset first, which is what preserves R7.07(b).
    // It must give way only when the right is genuinely occupied.
    const tgt = at("fail");
    expect((tgt.properties as any).labelOffsetX).toBeGreaterThan(0);
  });
});

describe("V25.05 — a data artifact clears the connectors under its label (R8.30)", () => {
  it("T3063 — no data-artifact label is drawn across a sequence or message connector", () => {
    // Paul's rule 2 said "elements OR connectors below them" from the outset.
    // Only the elements half could be done where R8.02's clearance pass sits:
    // it runs before routing, so a connector did not yet exist to avoid. The
    // first data object's name was landing on the flow out of the start event.
    const PAD = 4;
    for (const d of out.elements) {
      if (d.type !== "data-object" && d.type !== "data-store") continue;
      const box = externalLabelBox(d as any);
      if (!box) continue;
      for (const c of out.connectors as any[]) {
        if (c.type === "associationBPMN") continue;          // may span the diagram
        if (c.sourceId === d.id || c.targetId === d.id) continue;
        const w = c.waypoints ?? [];
        for (let i = 0; i < w.length - 1; i++) {
          const seg = {
            x: Math.min(w[i].x, w[i + 1].x) - PAD, y: Math.min(w[i].y, w[i + 1].y) - PAD,
            w: Math.abs(w[i].x - w[i + 1].x) + PAD * 2,
            h: Math.abs(w[i].y - w[i + 1].y) + PAD * 2,
          };
          expect(overlap(box, seg),
            `"${L(d)}" label is drawn across a connector`).toBe(false);
        }
      }
    }
  });

  it("T3064 — lifting an artifact keeps its own association attached to it", () => {
    // The move happens AFTER routing, which is only safe because a data artifact
    // is not a routing obstacle — but its OWN associations must be re-routed, or
    // the line is left pointing at where the object used to be.
    for (const d of out.elements) {
      if (d.type !== "data-object") continue;
      for (const c of (out.connectors as any[]).filter((x) => x.sourceId === d.id || x.targetId === d.id)) {
        const w = c.waypoints ?? [];
        if (!w.length) continue;
        const end = c.sourceId === d.id ? w[0] : w[w.length - 1];
        const near =
          end.x >= d.x - 2 && end.x <= d.x + d.width + 2 &&
          end.y >= d.y - 2 && end.y <= d.y + d.height + 2;
        expect(near, `"${L(d)}" association ends at ${end.x.toFixed(0)},${end.y.toFixed(0)} but the object is at ${d.x.toFixed(0)},${d.y.toFixed(0)}`).toBe(true);
      }
    }
  });
});

describe("V25.05 — a data artifact is REPEATED beside a remote consumer (R8.31)", () => {
  // do2 is written by t2 (early) and read by t3 (late), the shape that produced
  // a 3,000px association across the whole diagram.
  const orig = out.elements.filter((e) => e.id === "do2");
  const copies = out.elements.filter((e) => e.id.startsWith("do2__at_"));

  it("T3073 — the far consumer gets its own copy instead of a line across the diagram", () => {
    expect(orig).toHaveLength(1);
    expect(copies.length, "a remote reader should be served by a copy").toBeGreaterThanOrEqual(1);
    expect(copies[0].label).toBe(orig[0].label);
  });

  it("T3074 — every association is now short", () => {
    const dist = (a: any, b: any) =>
      Math.hypot((b.x + b.width / 2) - (a.x + a.width / 2), (b.y + b.height / 2) - (a.y + a.height / 2));
    for (const d of out.elements) {
      if (d.type !== "data-object" && d.type !== "data-store") continue;
      for (const c of (out.connectors as any[]).filter((x) => x.sourceId === d.id || x.targetId === d.id)) {
        const other = at(c.sourceId === d.id ? c.targetId : c.sourceId);
        expect(dist(d, other), `"${L(d)}" still reaches "${L(other)}" across the diagram`).toBeLessThan(600);
      }
    }
  });

  it("T3075 — the copy inherits the container of the element it serves", () => {
    // Paul: data objects are not owned by a lane the way an activity is, but
    // their parentage stays as it was — the copy takes the R8.02 rule.
    for (const c of copies) {
      const served = (out.connectors as any[])
        .filter((x) => x.sourceId === c.id || x.targetId === c.id)
        .map((x) => at(x.sourceId === c.id ? x.targetId : x.sourceId));
      expect(served.length).toBeGreaterThan(0);
      expect(c.parentId).toBe(served[0].parentId);
    }
  });

  it("T3076 — roles are re-derived after the split, so no copy keeps a marker that is no longer true", () => {
    for (const d of out.elements) {
      if (d.type !== "data-object") continue;
      const mine = (out.connectors as any[]).filter((x) => x.sourceId === d.id || x.targetId === d.id);
      if (!mine.length) continue;
      const written = mine.some((x) => x.targetId === d.id);
      const read = mine.some((x) => x.sourceId === d.id);
      const want = written && read ? undefined : written ? "output" : "input";
      expect((d.properties as any).role, `"${L(d)}" marker`).toBe(want);
    }
  });

  it("T3077 — the caller's plan is not mutated, so a replay cannot duplicate twice", () => {
    // The generate route reads plan.elements.length AFTER layout; adding copies
    // to the input arrays would corrupt the stored plan and make every replay
    // add another copy.
    const before = els.length;
    layoutBpmnDiagram(els, conns);
    expect(els.length).toBe(before);
    expect(conns.length).toBe(conns.length);
  });
});

describe("V23.04 — every connector stays attached to the elements it joins", () => {
  it("T3078 — no connector endpoint is left behind by a later element move", () => {
    // The invariant that would have caught the V23.04 regression outright.
    // R8.30's lift grew the LANE to make room, which moves the pool and restacks
    // the lanes — so every element shifted while the connectors, routed earlier,
    // stayed where they were. 18 of 38 came adrift. Nothing may move an element
    // after routing without re-routing what touches it.
    const by = new Map(out.elements.map((e) => [e.id, e] as const));
    const near = (p: any, e: any) =>
      p.x >= e.x - 3 && p.x <= e.x + e.width + 3 && p.y >= e.y - 3 && p.y <= e.y + e.height + 3;
    for (const c of out.connectors as any[]) {
      const s = by.get(c.sourceId), t = by.get(c.targetId);
      const w = c.waypoints ?? [];
      if (!s || !t || w.length < 2) continue;
      expect(near(w[0], s),
        `"${L(s)}" -> "${L(t)}" starts at ${w[0].x.toFixed(0)},${w[0].y.toFixed(0)} but its source is at ${s.x.toFixed(0)},${s.y.toFixed(0)}`).toBe(true);
      expect(near(w[w.length - 1], t),
        `"${L(s)}" -> "${L(t)}" ends at ${w[w.length - 1].x.toFixed(0)},${w[w.length - 1].y.toFixed(0)} but its target is at ${t.x.toFixed(0)},${t.y.toFixed(0)}`).toBe(true);
    }
  });

  it("T3079 — an artifact is never lifted out of its lane, and never grows one", () => {
    // The lift is capped by the room already in the band. Growing it after
    // routing is what detached the connectors.
    const lane = laneOf();
    for (const d of out.elements) {
      if (d.type !== "data-object" && d.type !== "data-store") continue;
      if (d.parentId !== lane.id) continue;
      expect(d.y, `"${L(d)}" was lifted above its lane`).toBeGreaterThanOrEqual(lane.y);
    }
  });
});
