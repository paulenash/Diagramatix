/**
 * T5296 — the "Immovable" connector (Paul, 2026-10-10, V01.06): a sequence connector whose left-hand approach was walled in could not be
 * dragged at all. When a stub landed inside another element the router threw away the caller's sides AND offsets, re-picked sides at
 * offset 0.5 from four fixed pairs, and drew the line through the subprocess; the stored sides then described a line that was never
 * drawn, and every edit recomputed the same route.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { layoutBpmnDiagram } from "@/app/lib/diagram/bpmnLayout";
import { computeWaypoints } from "@/app/lib/diagram/routing";
import { checkDiagram } from "@/app/lib/diagram/checks/diagramChecks";
import { withDrawnSides } from "@/app/hooks/useDiagram";

const DIR = "tests/fixtures/containment-2026-10-09";
const load = (f: string) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));

describe("T5296 immovable connector", () => {
  const plan = load("paul-V01.06-immovable.plan.json");
  const data = layoutBpmnDiagram(plan.elements, plan.connections);
  const by = new Map(data.elements.map((e) => [e.id, e]));
  const c = data.connectors.find((x) => x.sourceId === "t10" && x.targetId === "sp1")!;

  it("the line does not cross the subprocess, and it is drawn from the top face — not the walled-in left one", () => {
    expect(checkDiagram(data as never).filter((v) => v.rule === "sequence-clips-foreign-node")).toEqual([]);
    let used: { source: string; target: string } | undefined;
    const sp1 = by.get("sp1")!, t10 = by.get("t10")!;
    computeWaypoints(t10, sp1, data.elements, c.sourceSide, c.targetSide, c.routingType, c.sourceOffsetAlong ?? 0.5, c.targetOffsetAlong ?? 0.5, { onSides: (x) => { used = x; } });
    expect(used!.target).toBe("top");
  });

  it("the editor adopts the DRAWN sides on first edit, so a nudge does not jump back to the walled-in face", () => {
    const fixed = withDrawnSides(c, data.elements);
    expect(fixed.targetSide).toBe("top");
    expect(fixed.targetOffsetAlong).toBe(0.5);                            // an offset belongs to the side it was set on
    expect(fixed.sourceSide).toBe(c.sourceSide);                          // the unchanged end keeps its side AND offset
    expect(fixed.sourceOffsetAlong).toBe(c.sourceOffsetAlong);
    // …and a connector whose sides were already truthful is returned untouched
    expect(withDrawnSides(fixed, data.elements)).toBe(fixed);
    // The line drawn from the adopted sides starts and ends on those faces.
    const r = computeWaypoints(by.get(fixed.sourceId)!, by.get(fixed.targetId)!, data.elements, fixed.sourceSide, fixed.targetSide, fixed.routingType,
      fixed.sourceOffsetAlong ?? 0.5, fixed.targetOffsetAlong ?? 0.5, { honourSides: true });
    const t = by.get(fixed.targetId)!;
    expect(Math.abs(r.waypoints[r.waypoints.length - 2].y - t.y)).toBeLessThan(1.5);
  });

  it("a user's endpoint offset is honoured even when the face is walled in (the connector can be moved)", () => {
    const sp1 = by.get("sp1")!, t10 = by.get("t10")!;
    const end = (off: number) => {
      const r = computeWaypoints(t10, sp1, data.elements, "right", "left", "rectilinear", 0.5, off, { honourSides: true });
      return r.waypoints[r.waypoints.length - 2];
    };
    const ys = [0.2, 0.5, 0.8].map((o) => Math.round(end(o).y));
    expect(new Set(ys).size).toBe(3);                                  // three offsets, three different attach points
    expect(ys[0]).toBeLessThan(ys[1]);
    expect(ys[1]).toBeLessThan(ys[2]);
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(sp1.y);
  });

  it("without honourSides a blocked stub still gets re-routed, now to a side pair whose whole route is clear", () => {
    const sp1 = by.get("sp1")!, t10 = by.get("t10")!;
    let used: { source: string; target: string } | undefined;
    computeWaypoints(t10, sp1, data.elements, "right", "left", "rectilinear", 0.5, 0.5, { onSides: (s) => { used = s; } });
    expect(used).toBeDefined();
    expect(used!.target).not.toBe("left");
  });

  it("in every fixture diagram the first visible point of a task's connector lies on the face the router really used", () => {
    const bad: string[] = [];
    for (const f of readdirSync(DIR).filter((x) => x.endsWith(".plan.json"))) {
      const p = load(f);
      const d = layoutBpmnDiagram(p.elements, p.connections);
      const m = new Map(d.elements.map((e) => [e.id, e]));
      for (const k of d.connectors) {
        if (k.type !== "sequence" || !k.sourceInvisibleLeader || k.waypoints.length < 4) continue;
        const s = m.get(k.sourceId), t = m.get(k.targetId);
        if (!s || !t || s.type !== "task") continue;
        let used: { source: string; target: string } | undefined;
        computeWaypoints(s, t, d.elements, k.sourceSide, k.targetSide, k.routingType, k.sourceOffsetAlong ?? 0.5, k.targetOffsetAlong ?? 0.5, { onSides: (x) => { used = x; } });
        const a = k.waypoints[1];
        const ok = used!.source === "right" ? Math.abs(a.x - (s.x + s.width)) < 1.5 : used!.source === "left" ? Math.abs(a.x - s.x) < 1.5
          : used!.source === "top" ? Math.abs(a.y - s.y) < 1.5 : Math.abs(a.y - (s.y + s.height)) < 1.5;
        if (!ok) bad.push(f + ": " + k.id + " drawn from " + used!.source);
      }
    }
    expect(bad).toEqual([]);
  });
});
