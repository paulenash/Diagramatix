/**
 * "Move dividers", second round (Paul, 2026-09-28, after his first session —
 * tests/fixtures/voice-debug/move-dividers-session-1.json):
 *
 *   "the Voice Assist command, "move dividers", should move the lane boundaries
 *   without any constraint concerning the elements on the diagram. The only
 *   constraints should be a) the new lane/sublane heights must allow the
 *   lane/sublane names to be displayed, BUT wrapping the lane/sublane name to 2
 *   lines to allow for a narrower lane must be tried if it is possible. b) the
 *   pool boundary, of course."
 *
 *   "during the "move dividers" command mark the lane header inner vertical
 *   boundary with green ticks every 100 px"
 *
 * And what the session itself showed: an answer said in two halves.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import {
  adjustOp, collectDividers, dividerOp, dividerRulers, movedPx, parseDividerAnswer, readDividerUtterance,
  RULER_STEP_PX, type DividerMemory,
} from "@/app/lib/assist/dividerFlow";
import { givingBands, wrapLabelInTwo } from "@/app/lib/diagram/laneBoundary";
import { laneMetrics } from "@/app/lib/diagram/containerMetrics";
import { containerHeaderWidth } from "@/app/lib/diagram/containerHeader";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { editorSource } from "./assistApplySource";

const session1 = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/move-dividers-session-1.json", "utf8")).diagram;
const session4 = (): DiagramData => JSON.parse(readFileSync("tests/fixtures/voice-debug/boundary-session-4.json", "utf8")).diagram;
const E = (o: Record<string, unknown>) => ({ properties: {}, ...o }) as unknown as DiagramElement;
const byId = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

/** Say one divider answer, the way the flow runs it. */
const answer = (d: DiagramData, said: string) => {
  const h = headlessDiagram(d);
  const a = parseDividerAnswer(said, collectDividers(d.elements))!;
  expect(a, said).toBeTruthy();
  return { h, r: applyAssistOps([dividerOp(a)], h.context()) };
};

/** A pool of two lanes, the top one exactly `topH` tall. */
const twoLanes = (topLabel: string, topH: number, bottomLabel = "Office", bottomH = 200): DiagramData => ({
  elements: [
    E({ id: "P", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: topH + bottomH, properties: { poolType: "white-box" } }),
    E({ id: "A", type: "lane", label: topLabel, x: 36, y: 0, width: 864, height: topH, parentId: "P" }),
    E({ id: "B", type: "lane", label: bottomLabel, x: 36, y: topH, width: 864, height: bottomH, parentId: "P" }),
    E({ id: "t1", type: "task", label: "Task 1", x: 200, y: topH - 40, width: 102, height: 64, parentId: "A" }),
  ],
  connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
}) as unknown as DiagramData;

describe("T4974 — “move dividers” moves through the elements: no constraint from what is on the diagram", () => {
  it("Paul's refused answer now moves — “one down” on his session diagram — and what the line passes changes lane", () => {
    const d = session1();
    const y0 = byId(d, "6ry0lcpt").y;
    const { h, r } = answer(d, "1 down 50 pixels");
    expect(r).toEqual({ ok: true, summary: "moved Finance's top boundary down 50px" });
    expect(byId(h.data, "6ry0lcpt").y).toBeCloseTo(y0 + 50, 6);
    // "Task 11" (272–337) now sits above the line at 319: it is Office's. Nothing moved on the page.
    const t11 = h.data.elements.find((e) => e.label === "Task 11")!;
    expect(t11.parentId).toBe("2uv54rys");
    expect(t11.y).toBe(d.elements.find((e) => e.label === "Task 11")!.y);
  });

  it("the boundary-session diagram too: “1 up 100 pixels” moves the full 100px over seven elements", () => {
    const d = session4();
    const { h, r } = answer(d, "1 up 100 pixels");
    expect(r).toEqual({ ok: true, summary: "moved Underwriters team's top boundary up 100px" });
    const rehomed = d.elements.filter((e) => byId(h.data, e.id).parentId !== e.parentId);
    expect(rehomed.map((e) => e.label?.replace(/\n/g, " ")).sort()).toEqual(
      ["Complete Documentation", "Draft Documentation", "Pass Claim Check?", "Re-work Required?", "Review Documentation", "Transform"]);
    for (const e of d.elements) if (!["pool", "lane", "sublane"].includes(e.type)) expect(byId(h.data, e.id).y, `${e.label} stays where it is`).toBe(e.y);
  });

  it("the NAMED boundary command keeps its old promise — it still never runs a line through anything", () => {
    const d = session4();
    const h = headlessDiagram(d);
    const r = applyAssistOps(parseCommand("move Underwriters team top boundary up 100 pixels")!, h.context());
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/^the divider would run through /);
    expect(h.data).toEqual(d);
  });
});

describe("T4975 — the names are the floor, and a name wraps onto two lines when that lets the lane go narrower", () => {
  it("wrapLabelInTwo splits where the longer line is shortest — and leaves a single word, or two lines, alone", () => {
    expect(wrapLabelInTwo("Accounts Payable Team")).toBe("Accounts\nPayable Team");
    expect(wrapLabelInTwo("Claims Processing")).toBe("Claims\nProcessing");
    expect(wrapLabelInTwo("Underwriters team")).toBe("Underwriters\nteam");
    expect(wrapLabelInTwo("Office")).toBeNull();
    expect(wrapLabelInTwo("Two\nlines")).toBeNull();
    expect(wrapLabelInTwo("")).toBeNull();
    expect(wrapLabelInTwo(undefined)).toBeNull();
  });

  it("a lane at its name's floor wraps its name, and the divider goes on — the reply says so", () => {
    const one = laneMetrics("Accounts Payable Team", 14).minHeight;   // 193
    const two = laneMetrics("Accounts\nPayable Team", 14).minHeight;  // 117
    const d = twoLanes("Accounts Payable Team", 260);
    const { h, r } = answer(d, "1 up 200");
    const moved = 260 - two;
    expect(moved).toBeGreaterThan(260 - one);
    expect(r).toEqual({ ok: true, summary: `moved Office's top boundary up ${moved}px — “Accounts Payable Team” now wraps onto two lines — Accounts Payable Team is as small as its name allows` });
    expect(byId(h.data, "A").label).toBe("Accounts\nPayable Team");
    expect(byId(h.data, "A").height).toBe(two);
    // Two lines need a wider name strip — both lanes' strips grow together, as a typed name does.
    expect(containerHeaderWidth(byId(h.data, "A"))).toBe(laneMetrics("a\nb", 14).headerWidth);
    expect(containerHeaderWidth(byId(h.data, "B"))).toBe(containerHeaderWidth(byId(h.data, "A")));
    // The pool never changes size.
    expect(byId(h.data, "P").height).toBe(byId(d, "P").height);
  });

  it("a move that fits never wraps; a one-word name stops at its floor and says so", () => {
    const fits = answer(twoLanes("Accounts Payable Team", 260), "1 up 20");
    expect(fits.r).toEqual({ ok: true, summary: "moved Office's top boundary up 20px" });
    expect(byId(fits.h.data, "A").label).toBe("Accounts Payable Team");
    const word = answer(twoLanes("Procurement", 200), "1 up 200");
    const floor = laneMetrics("Procurement", 14).minHeight;
    expect(word.r).toEqual({ ok: true, summary: `moved Office's top boundary up ${200 - floor}px — Procurement is as small as its name allows` });
    const none = answer(twoLanes("Procurement", floor), "1 up 50");
    expect(none.r).toEqual({ ok: false, summary: "Procurement is as small as its name allows — the divider can't move up" });
    expect(none.h.data.elements).toEqual(twoLanes("Procurement", floor).elements);
  });

  it("inside a lane with sub-lanes it is the edge SUB-LANE that gives way, so its name is the one that wraps", () => {
    const d = twoLanes("Finance", 400);
    const A = byId(d, "A");
    d.elements.push(
      E({ id: "S1", type: "lane", label: "Payroll", x: A.x + 36, y: 0, width: A.width - 36, height: 190, parentId: "A" }),
      E({ id: "S2", type: "lane", label: "Accounts Payable Team", x: A.x + 36, y: 190, width: A.width - 36, height: 210, parentId: "A" }),
    );
    expect(givingBands(d.elements, A, "last").map((b) => b.id)).toEqual(["A", "S2"]);
    const { h, r } = answer(d, "2 up 150");   // 1 is S1|S2, 2 is A|B
    expect(r.ok).toBe(true);
    expect(r.summary).toContain("“Accounts Payable Team” now wraps onto two lines");
    expect(byId(h.data, "S2").label).toBe("Accounts\nPayable Team");
    expect(byId(h.data, "S1").height, "only the edge sub-lane gives way").toBe(190);
    expect(byId(h.data, "B").y).toBeCloseTo(400 - movedPx(r.summary), 6);
  });
});

describe("T4976 — the pool is the other limit: a divider never takes the pool with it", () => {
  it("“1 down 2000” and “1 up 2000” stop where the band giving way meets its name, and the pool keeps its size", () => {
    const d = session1();
    const pool = byId(d, "88mmfy5f");
    const down = answer(d, "1 down 2000");
    expect(down.r.summary).toMatch(/^moved Finance's top boundary down \d+px — Finance is as small as its name allows$/);
    expect(byId(down.h.data, "6ry0lcpt").height).toBe(laneMetrics("Finance", 14).minHeight);
    const up = answer(session1(), "1 up 2000");
    expect(up.r.summary).toMatch(/^moved Finance's top boundary up \d+px — Office is as small as its name allows$/);
    for (const h of [down.h, up.h]) {
      const p = byId(h.data, "88mmfy5f");
      expect([p.y, p.height]).toEqual([pool.y, pool.height]);
      const lanes = h.data.elements.filter((e) => e.parentId === pool.id && e.type === "lane");
      expect(lanes.reduce((s, l) => s + l.height, 0)).toBeCloseTo(pool.height, 6);
    }
  });
});

describe("T4977 — an answer said in two halves is still one answer (Paul's session, 2026-09-28)", () => {
  const ts = collectDividers(session1().elements);   // one divider: Office / Finance

  it("a bare “one” is HELD — never “accept the suggestion” — and “down two tasks” finishes it", () => {
    const mem: DividerMemory = {};
    expect(readDividerUtterance("one", ts, mem)).toEqual({ kind: "hold", n: 1 });
    expect(readDividerUtterance("One.", ts, mem)).toEqual({ kind: "hold", n: 1 });
    expect(readDividerUtterance("two", ts, mem), "no divider 2 — explained, and the flow stays open").toEqual({ kind: "miss" });
    mem.pendingN = 1;
    const u = readDividerUtterance("down two tasks", ts, mem);
    expect(u).toMatchObject({ kind: "move", answer: { direction: "down", distance: 128 } });
    expect(readDividerUtterance("up", ts, mem)).toMatchObject({ kind: "move", answer: { direction: "up" } });
  });

  it("an amount on its own after an answer makes that move the amount IN ALL", () => {
    const mem: DividerMemory = { last: { id: ts[0].id, n: 1, direction: "down", moved: 20 } };
    const u = readDividerUtterance("fifty pixels", ts, mem);
    expect(u).toMatchObject({ kind: "adjust", direction: "down", total: 50 });
    expect(readDividerUtterance("by fifty", ts, mem)).toMatchObject({ kind: "adjust", total: 50 });
    expect(readDividerUtterance("make it a hundred pixels", ts, mem)).toMatchObject({ kind: "adjust", total: 100 });
    const t = ts[0];
    expect(adjustOp({ target: t, direction: "down", total: 50 }, 20)).toMatchObject({ op: "movePoolBoundary", direction: "down", distance: 30, overContent: true });
    expect(adjustOp({ target: t, direction: "down", total: 50 }, 0), "the first half was refused: all 50").toMatchObject({ direction: "down", distance: 50 });
    expect(adjustOp({ target: t, direction: "down", total: 50 }, 80), "too far: back up").toMatchObject({ direction: "up", distance: 30 });
    expect(adjustOp({ target: t, direction: "down", total: 50 }, 50)).toBeNull();
  });

  it("…and a whole new command is never taken for half an answer", () => {
    const mem: DividerMemory = { pendingN: 1, last: { id: ts[0].id, n: 1, direction: "down", moved: 20 } };
    for (const said of ["move Salesforce down twenty pixels", "move customer up", "add Task 2", "rename pool", "add two lanes", "put a pool around everything", "delete Task 11"]) {
      expect(readDividerUtterance(said, ts, mem), said).toBeNull();
      expect(parseCommand(said), `${said} — so it closes the flow and runs`).toBeTruthy();
    }
  });

  it("played through: “one down” … “fifty pixels” is 50px in all on Paul's diagram", () => {
    const d = session1();
    const y0 = byId(d, "6ry0lcpt").y;
    const h = headlessDiagram(d);
    const mem: DividerMemory = {};
    const first = readDividerUtterance("one down", collectDividers(h.data.elements), mem);
    expect(first?.kind).toBe("move");
    const r1 = applyAssistOps([dividerOp((first as { answer: Parameters<typeof dividerOp>[0] }).answer)], h.context());
    expect(r1).toEqual({ ok: true, summary: "moved Finance's top boundary down 20px" });
    mem.last = { id: collectDividers(h.data.elements)[0].id, n: 1, direction: "down", moved: movedPx(r1.summary) };
    const second = readDividerUtterance("fifty pixels", collectDividers(h.data.elements), mem);
    expect(second?.kind).toBe("adjust");
    const r2 = applyAssistOps([adjustOp(second as Parameters<typeof adjustOp>[0], mem.last!.moved)!], h.context());
    expect(r2).toEqual({ ok: true, summary: "moved Finance's top boundary down 30px" });
    expect(byId(h.data, "6ry0lcpt").y).toBeCloseTo(y0 + 50, 6);
  });
});

describe("T4978 — the ruler: green ticks every 100px down the lanes' name strips while the numbers are up", () => {
  it("one ruler per pool with lanes, on the inner edge of the name strip, a tick every 100px from the pool's top", () => {
    const d = session1();
    const pool = byId(d, "88mmfy5f"), lane = byId(d, "2uv54rys");
    const rs = dividerRulers(d.elements);
    expect(rs).toHaveLength(1);   // Salesforce and Customer have no lanes
    expect(rs[0].x).toBe(lane.x + containerHeaderWidth(lane));
    expect(rs[0].ticks).toEqual([1, 2, 3, 4, 5].map((k) => pool.y + k * RULER_STEP_PX));
    expect(rs[0].ticks.every((y) => y > pool.y && y < pool.y + pool.height)).toBe(true);
    // A wrapped name widens the strip — the ruler follows it.
    const wide = d.elements.map((e) => (e.parentId === pool.id && e.type === "lane" ? { ...e, properties: { ...e.properties, laneHeaderWidth: 42 } } : e));
    expect(dividerRulers(wide)[0].x).toBe(lane.x + 42);
  });

  it("the editor draws it only while “move dividers” is open, and the Canvas draws it in green under the numbers", () => {
    const ed = editorSource();
    expect(ed).toContain("const onScreenRulers = useMemo(() => (dividerFlow ? dividerRulers(data.elements) : null), [dividerFlow, data.elements]);");
    expect(ed).toContain("dividerRulers={onScreenRulers}");
    // The memory is fresh each time the flow opens or closes.
    expect(ed).toContain("const setDividerFlow = useCallback((f: DividerFlow | null) => { dividerFlowRef.current = f; dividerMemRef.current = {}; setDividerFlowState(f); }, []);");
    // Changed 2026-09-28: numbered in the order the flow opened with (T4983).
    expect(ed).toContain("const answer = readDividerUtterance(heard, collectDividers(elementsRef.current, dividerFlowRef.current.order), dividerMemRef.current);");
    const cv = readFileSync("app/components/canvas/Canvas.tsx", "utf8");
    const ruler = cv.indexOf("{dividerRulers && dividerRulers.length > 0 && (");
    const badges = cv.indexOf("{renameBadges && renameBadges.length > 0 && (");
    expect(ruler).toBeGreaterThan(0);
    expect(ruler, "under the numbers").toBeLessThan(badges);
    expect(cv.slice(ruler, badges)).toContain('stroke="#16a34a"');
  });
});
