/**
 * What the straddle sweep found (2026-09-28): 39 agents probed every command
 * family on diagrams where elements sit ACROSS a lane divider — the state
 * "move dividers" and the mouse now leave — and each finding was reproduced
 * by an independent skeptic. These are the ones fixed first: the flow built
 * the same day, a silent data loss, and a lane slid like a shape.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { adjustOp, buildDividerFlow, collectDividers, dividerOp, parseDividerAnswer, readDividerUtterance, type DividerMemory } from "@/app/lib/assist/dividerFlow";
import { shrinkRoom } from "@/app/lib/diagram/laneBands";
import { laneMetrics } from "@/app/lib/diagram/containerMetrics";
import { checkElementOverlap } from "@/app/lib/diagram/checks/diagramChecks";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { editorSource } from "./assistApplySource";

const load = (f: string): DiagramData => JSON.parse(readFileSync(`tests/fixtures/voice-debug/${f}`, "utf8")).diagram;
const E = (o: Record<string, unknown>) => ({ properties: {}, ...o }) as unknown as DiagramElement;
const byId = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const byLabel = (d: DiagramData, l: string) => d.elements.find((e) => e.label === l)!;
const say = (h: ReturnType<typeof headlessDiagram>, s: string) => applyAssistOps(parseCommand(s)!, h.context());
/** The lanes of a pool still tile it exactly, top to bottom. */
const tiles = (d: DiagramData, poolId: string) => {
  const p = byId(d, poolId);
  const lanes = d.elements.filter((e) => e.type === "lane" && e.parentId === poolId).sort((a, b) => a.y - b.y);
  let y = p.y;
  for (const l of lanes) { if (Math.abs(l.y - y) > 0.5) return false; y = l.y + l.height; }
  return Math.abs(y - (p.y + p.height)) <= 0.5;
};

describe("T4982 — with the numbers up, a whole command is never read as an answer", () => {
  const ts = collectDividers(fixtureDiagram().elements);   // 1 = Lane 3 / Underwriters, 2 = Underwriters / Lane 2

  it("“move Lane 2 top boundary up 40” — a mis-heard “lane” is 1 — closed the flow's divider 1 through elements; now it is the command it says", () => {
    for (const said of ["move Lane 2 top boundary up 40", "Lane 2 top boundary down 40", "move lane 2 down", "move the lane up", "move lane two down 50"]) {
      expect(readDividerUtterance(said, ts, {}), said).toBeNull();
      expect(parseCommand(said), `${said} — so it closes the flow and runs`).toBeTruthy();
    }
  });

  it("…and every real answer still reads — a number, one way, an amount, nothing else", () => {
    const a = (s: string) => { const x = parseDividerAnswer(s, ts); return x ? [x.target.n, x.direction, x.distance ?? "step"] : null; };
    expect(a("one a hundred and fifty pixels down"), "Paul's own, 2026-09-28").toEqual([1, "down", 150]);
    expect(a("one twenty pixels down")).toEqual([1, "down", 20]);
    expect(a("lane up 100 pixels"), "“one”, mis-heard as “lane”").toEqual([1, "up", 100]);
    expect(a("1 down half a task")).toEqual([1, "down", 32]);
    expect(a("2 up 20 more please")).toEqual([2, "up", 20]);
    expect(a("1 up up")).toBeNull();
    expect(a("1 up 40 Finance")).toBeNull();
  });
});

describe("T4983 — the numbers stay put while the flow is open, and the memory follows a divider, not a number", () => {
  // Two pools side by side: A's divider at 300 (1), B's at 400 (2).
  const twoPools = (): DiagramData => ({
    elements: [
      E({ id: "PA", type: "pool", label: "Alpha", x: 0, y: 0, width: 600, height: 600, properties: { poolType: "white-box" } }),
      E({ id: "A1", type: "lane", label: "North", x: 36, y: 0, width: 564, height: 300, parentId: "PA" }),
      E({ id: "A2", type: "lane", label: "South", x: 36, y: 300, width: 564, height: 300, parentId: "PA" }),
      E({ id: "PB", type: "pool", label: "Beta", x: 800, y: 0, width: 600, height: 600, properties: { poolType: "white-box" } }),
      E({ id: "B1", type: "lane", label: "East", x: 836, y: 0, width: 564, height: 400, parentId: "PB" }),
      E({ id: "B2", type: "lane", label: "West", x: 836, y: 400, width: 564, height: 200, parentId: "PB" }),
    ],
    connectors: [], viewport: { x: 0, y: 0, zoom: 1 },
  }) as unknown as DiagramData;

  it("“1 down 150” takes A's divider below B's — it is still 1, and “fifty pixels” brings A's back, never B's", () => {
    const h = headlessDiagram(twoPools());
    const flow = buildDividerFlow(h.data.elements);
    if ("error" in flow) throw new Error(flow.error);
    expect(flow.order).toEqual(["divider:A1|A2", "divider:B1|B2"]);
    const mem: DividerMemory = {};
    const first = readDividerUtterance("1 down 150", collectDividers(h.data.elements, flow.order), mem);
    expect(first).toMatchObject({ kind: "move", answer: { target: { id: "divider:A1|A2" } } });
    const r1 = applyAssistOps([dividerOp((first as { answer: Parameters<typeof dividerOp>[0] }).answer)], h.context());
    expect(r1.ok).toBe(true);
    mem.last = { id: "divider:A1|A2", n: 1, direction: "down", moved: 150 };
    const now = collectDividers(h.data.elements, flow.order);
    expect(now.map((d) => [d.n, d.id])).toEqual([[1, "divider:A1|A2"], [2, "divider:B1|B2"]]);
    expect(collectDividers(h.data.elements).map((d) => d.id), "by height alone they would have swapped").toEqual(["divider:B1|B2", "divider:A1|A2"]);
    const second = readDividerUtterance("fifty pixels", now, mem);
    expect(second).toMatchObject({ kind: "adjust", target: { id: "divider:A1|A2" }, total: 50 });
    applyAssistOps([adjustOp(second as Parameters<typeof adjustOp>[0], 150)!], h.context());
    expect(byId(h.data, "A2").y).toBeCloseTo(350, 6);
    expect(byId(h.data, "B2").y, "B's divider never moved").toBe(400);
  });

  it("the editor numbers the badges, the answers and the routing by the open flow's order", () => {
    const ed = editorSource();
    expect(ed).toContain("collectDividers(data.elements, dividerFlow.order)");
    expect(ed).toContain("const targets = collectDividers(elementsRef.current, dividerFlowRef.current?.order);");
    expect(ed).toContain("readDividerUtterance(heard, collectDividers(elementsRef.current, dividerFlowRef.current.order), dividerMemRef.current)");
  });
});

describe("T4984 — an amount after holding another divider waits for its way; a number that is no divider is an amount", () => {
  const ts = collectDividers(load("boundary-session-4.json").elements);   // 2 dividers

  it("“2 down 40” … “one” … “sixty pixels” asks “up or down?” — then “down” is 1 down 60, and divider 2 never moves", () => {
    const mem: DividerMemory = { pendingN: 1, last: { id: ts[1].id, n: 2, direction: "down", moved: 40 } };
    expect(readDividerUtterance("sixty pixels", ts, mem)).toEqual({ kind: "askWay", n: 1, px: 60 });
    mem.pendingPx = 60;
    expect(readDividerUtterance("down", ts, mem)).toMatchObject({ kind: "move", answer: { target: { n: 1 }, direction: "down", distance: 60 } });
    expect(readDividerUtterance("down 20", ts, mem), "a way with its own amount keeps it").toMatchObject({ kind: "move", answer: { distance: 20 } });
  });

  it("after an answer, “twenty”, “20”, “fifteen”, “100” are amounts — before one, “twenty” is no divider", () => {
    const mem: DividerMemory = { last: { id: ts[1].id, n: 2, direction: "down", moved: 50 } };
    for (const [said, px] of [["twenty", 20], ["20", 20], ["fifteen", 15], ["100", 100], ["ten", 10]] as const) {
      expect(readDividerUtterance(said, ts, mem), said).toMatchObject({ kind: "adjust", target: { n: 2 }, total: px });
    }
    expect(readDividerUtterance("twenty", ts, {})).toEqual({ kind: "miss" });
    expect(readDividerUtterance("two", ts, mem), "a divider's number is still a divider").toEqual({ kind: "hold", n: 2 });
  });
});

describe("T4985 — a lane with sub-lanes stops at its OWN name, and the reply names the band that stopped", () => {
  it("shrinkRoom: the least of the container's own room and its edge band's", () => {
    expect(shrinkRoom({ height: 200, min: 159, bands: [{ height: 100, min: 42 }, { height: 100, min: 42 }] }, "first")).toBe(41);
    expect(shrinkRoom({ height: 400, min: 159, bands: [{ height: 60, min: 42 }, { height: 340, min: 42 }] }, "first")).toBe(18);
    expect(shrinkRoom({ height: 200, min: 60 }, "last")).toBe(140);
  });

  it("on Paul's diagram with Underwriters team split into Ops and Tax: never below its name — wrapped when that helps — and Ops/Tax stay inside it", () => {
    const h = headlessDiagram(load("boundary-session-4.json"));
    h.actions.splitLaneEven("L2", ["Ops", "Tax"]);
    const floor1 = laneMetrics("Underwriters team", 14).minHeight, floor2 = laneMetrics("Underwriters\nteam", 14).minHeight;
    const r1 = applyAssistOps([dividerOp(parseDividerAnswer("1 down 300", collectDividers(h.data.elements))!)], h.context());
    expect(r1.summary).toMatch(/^moved Underwriters team's top boundary down \d+px — Underwriters team is as small as its name allows$/);
    expect(byId(h.data, "L2").height).toBe(floor1);
    const r3 = applyAssistOps([dividerOp(parseDividerAnswer("3 up 300", collectDividers(h.data.elements))!)], h.context());
    expect(r3.summary).toMatch(/^moved Finance team's top boundary up \d+px — “Underwriters team” now wraps onto two lines — Underwriters team is as small as its name allows$/);
    expect(byId(h.data, "L2").height).toBe(floor2);
    const L2 = byId(h.data, "L2");
    for (const s of h.data.elements.filter((e) => e.parentId === "L2")) expect(s.x + s.width, `${s.label} ends on the lane's right edge`).toBeCloseTo(L2.x + L2.width, 6);
  });
});

describe("T4986 — a wrapped name never pushes anything out of its pool", () => {
  it("a two-line name widens the name strips; sub-lanes move right AND narrow, so they end where their lane ends", () => {
    const h = headlessDiagram(load("boundary-session-4.json"));
    h.actions.splitLaneEven("L3", ["Payments", "Audit"]);
    h.actions.updateLabel("L2", "Underwriters\nteam");
    const L3 = byId(h.data, "L3");
    for (const s of h.data.elements.filter((e) => e.parentId === "L3")) expect(s.x + s.width, s.label).toBeCloseTo(L3.x + L3.width, 6);
  });

  it("at a larger lane font, where the shift would put a task past the pool's edge, the name is not wrapped", () => {
    const fs = 18;
    const one = laneMetrics("Accounts Payable Team", fs).minHeight;
    const d = {
      elements: [
        E({ id: "P", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: 700, properties: { poolType: "white-box" } }),
        E({ id: "A", type: "lane", label: "Accounts Payable Team", x: 36, y: 0, width: 864, height: 420, parentId: "P" }),
        E({ id: "B", type: "lane", label: "Office", x: 36, y: 420, width: 864, height: 280, parentId: "P" }),
        E({ id: "t", type: "task", label: "Pay", x: 790, y: 40, width: 102, height: 64, parentId: "A" }),
      ],
      connectors: [], viewport: { x: 0, y: 0, zoom: 1 }, laneFontSize: fs,
    } as unknown as DiagramData;
    const h = headlessDiagram(d);
    const r = applyAssistOps([dividerOp(parseDividerAnswer("1 up 400", collectDividers(h.data.elements))!)], h.context());
    expect(r).toEqual({ ok: true, summary: `moved Office's top boundary up ${420 - one}px — Accounts Payable Team is as small as its name allows` });
    expect(byId(h.data, "A").label).toBe("Accounts Payable Team");
    expect(byId(h.data, "t").x).toBe(790);
  });
});

describe("T4987 — “delete X and compact” deletes X and nothing else, and never lands one element on another", () => {
  it("the column holds something in another lane: X goes, the gap stays, and the reply says why", () => {
    const cases: Array<[string, string, string]> = [
      ["delete Pay Claim and compact", "Claim Approved?", "deleted Pay Claim — the gap stays: closing it would also delete “Claim Approved?”"],
      ["delete Subprocess 3 and compact", "Pass Claim Check?", "deleted Subprocess 3 — the gap stays: closing it would also delete “Pass Claim Check?”"],
      ["delete Check Coverage and compact", "Re-work Required?", "deleted Check Coverage — the gap stays: closing it would also delete “Re-work Required?”"],
    ];
    for (const [said, kept, reply] of cases) {
      const d = fixtureDiagram();
      const h = headlessDiagram(d);
      expect(say(h, said), said).toEqual({ ok: true, summary: reply });
      expect(h.data.elements.map((e) => e.label?.replace(/\s+/g, " ")), `${kept} is still there`).toContain(kept);
      expect(h.data.elements).toHaveLength(d.elements.length - 1);
    }
    const h = headlessDiagram(fixtureDiagram());
    expect(say(h, "delete Review Claim and compact")).toEqual({ ok: true, summary: "deleted Review Claim — the gap stays: closing it would put “Task 1” on “Task 2”" });
    expect(checkElementOverlap(h.data)).toEqual([]);
  });

  it("a clear column still compacts — one element fewer, nothing new on top of anything", () => {
    for (const said of ["delete Task 1 and compact", "delete Claim Closed and compact"]) {
      const d = fixtureDiagram();
      const h = headlessDiagram(d);
      expect(say(h, said).summary, said).toMatch(/ and compacted$/);
      expect(h.data.elements).toHaveLength(d.elements.length - 1);
      expect(checkElementOverlap(h.data)).toEqual([]);
    }
  });
});

describe("T4988 — a lane is never slid as a shape: up or down it moves AS a lane, or says why not", () => {
  it("“move Underwriters up/down”, “nudge Underwriters up”: the lane moves in its stack, the lanes still tile the pool, the pool keeps its size", () => {
    for (const said of ["move Underwriters up", "move Underwriters down", "nudge Underwriters up"]) {
      const d = fixtureDiagram();
      const h = headlessDiagram(d);
      const r = say(h, said);
      expect(r, said).toEqual({ ok: true, summary: `moved Underwriters ${said.endsWith("down") ? "down" : "up"}` });
      const pool = byLabel(d, "Claims Processing");
      expect([byId(h.data, pool.id).y, byId(h.data, pool.id).height], said).toEqual([pool.y, pool.height]);
      expect(tiles(h.data, pool.id), said).toBe(true);
      expect(checkElementOverlap(h.data), said).toEqual([]);
    }
  });

  it("at the pool's edge, or sideways, it says so and changes nothing", () => {
    const s1 = load("move-dividers-session-1.json");
    for (const [d, said, reply] of [
      [s1, "move Finance up", "Finance is the bottom lane — moving it up needs a lane below it to take up the gap"],
      [s1, "move Office down", "Office is the top lane — moving it down needs a lane above it to take up the gap"],
      [s1, "nudge Finance up", "Finance is the bottom lane — moving it up needs a lane below it to take up the gap"],
      [fixtureDiagram(), "move Lane 3 up", "Lane 3 is against the pool edge — can't move it up"],
      [fixtureDiagram(), "nudge Underwriters left", "Underwriters is a lane — to move what is in it, say “move everything in Underwriters one step to the left”"],
    ] as const) {
      const h = headlessDiagram(d);
      expect(say(h, said), said).toEqual({ ok: false, summary: reply });
      expect(h.data.elements, said).toEqual(headlessDiagram(d).data.elements);
    }
  });
});
