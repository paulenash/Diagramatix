/**
 * "Compress lane X" and "expand lane X [by N]".
 *
 * Paul, 2026-09-26: "Add commands Compress Lane <lane_name>, and, Expand Lane
 * <lane_name>". Asked what should move, he chose THE BOTTOM EDGE:
 *   • compress — the top stays; the content slides up to ½ Task under it; the
 *     bottom comes up to ½ Task under the lowest content, never below what the
 *     lane's name or the pool's name needs; the lanes below close up, the pool
 *     shrinks, the pools below stay put; a lane with sub-lanes is fitted one
 *     sub-lane at a time; a second compress changes nothing.
 *   • expand — one Task row (64 px) or "by N" at the bottom; the last sub-lane
 *     takes it; the lanes below move down; the pools below are pushed by the
 *     100-px rule.
 *
 * Before this, "compress the Sales lane" was caught by the POOL rule and
 * refused ("Sales isn't a pool"), and "expand lane Sales" went to an AI that
 * had no lane-resize op. The names below are the test diagram's
 * (commandFixture.ts): Claims Team (Sub 1, Sub 2), Underwriters, Lane 3.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import { refKind } from "@/app/lib/assist/refKinds";
import { validateOp } from "@/app/lib/assist/ops";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { substituteRef } from "@/app/lib/assist/disambiguate";
import { checkEffect } from "@/app/lib/assist/opEffects";
import { opFlashes } from "@/app/lib/assist/goldFlash";
import { repairAddWord, repairHeardWords } from "@/app/lib/assist/selectedWord";
import { parseBoundaryEventPhrase } from "@/app/lib/assist/boundaryEventPhrase";
import { looksLikeAnotherCommand } from "@/app/lib/assist/greedyGuards";
import { hasCommandAfterName, COMMAND_VERBS, EXPAND_VERBS } from "@/app/lib/assist/commandVerbs";
import { generateCases } from "@/app/lib/assist/commandGenerator";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { fixtureDiagram, fixtureElements } from "@/app/lib/assist/commandFixture";
import { reducer } from "@/app/hooks/useDiagram";
import { carveGeometry } from "@/app/lib/diagram/laneStack";
import { fitLaneToContent, setBandHeightAtBottom, LANE_EXPAND_STEP } from "@/app/lib/diagram/laneFit";
import { laneMetrics, poolMetrics } from "@/app/lib/diagram/containerMetrics";
import type { AssistOp } from "@/app/lib/assist/ops";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => o as unknown as DiagramElement;
const src = (p: string) => readFileSync(p, "utf8");
const diagram = (elements: DiagramElement[]): DiagramData => ({ elements, connectors: [], viewport: { x: 0, y: 0, zoom: 1 } } as DiagramData);
const at = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;
const compress = (d: DiagramData, laneId: string) => reducer(d, { type: "COMPRESS_LANE", payload: { laneId } });
const expand = (d: DiagramData, laneId: string, by: number) => reducer(d, { type: "EXPAND_LANE", payload: { laneId, by } });
const isBand = (e: DiagramElement) => e.type === "lane" || e.type === "sublane";

/** Every stack in the diagram fills its container exactly — the swimlane rule. */
function expectTiled(d: DiagramData, why = "") {
  for (const parent of d.elements.filter((e) => e.type === "pool" || isBand(e))) {
    const kids = d.elements.filter((e) => isBand(e) && e.parentId === parent.id).sort((a, b) => a.y - b.y);
    if (!kids.length) continue;
    let y = parent.y;
    for (const k of kids) {
      expect(k.y, `${why} ${k.label} starts where the band above it ends`).toBeCloseTo(y, 6);
      y = k.y + k.height;
    }
    expect(y, `${why} the bands in ${parent.label} reach its bottom`).toBeCloseTo(parent.y + parent.height, 6);
  }
}

/** Every element sits inside the band that owns it. */
function expectContentInside(d: DiagramData, why = "") {
  for (const e of d.elements) {
    if (isBand(e) || e.type === "pool" || !e.parentId) continue;
    const p = at(d, e.parentId);
    if (!isBand(p)) continue;
    expect(e.y, `${why} ${e.label} below the top of ${p.label}`).toBeGreaterThanOrEqual(p.y - 1e-6);
    expect(e.y + e.height, `${why} ${e.label} above the bottom of ${p.label}`).toBeLessThanOrEqual(p.y + p.height + 1e-6);
  }
}

/** Parse, then apply to a headless editor — what the live command does. */
function say(sentence: string, opts: { selected?: string[]; d?: DiagramData } = {}) {
  const h = headlessDiagram(opts.d ?? fixtureDiagram());
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: opts.selected }));
  return { ...r, h, ops: ops!, after: h.data };
}

describe("T4903 — the sentences: a lane word makes it a lane command", () => {
  const P = (s: string) => parseCommand(s);

  it("compress with a lane or sub-lane word, either side of the name, is compressLane", () => {
    expect(P("compress the Sales lane")).toEqual([{ op: "compressLane", laneRef: "lane Sales" }]);
    expect(P("compress lane Sales")).toEqual([{ op: "compressLane", laneRef: "lane Sales" }]);
    expect(P("compress lane two")).toEqual([{ op: "compressLane", laneRef: "lane two" }]);
    expect(P("compress Lane 2")).toEqual([{ op: "compressLane", laneRef: "lane 2" }]);
    expect(P("compress line three"), "a leading “line” is the lane mis-heard").toEqual([{ op: "compressLane", laneRef: "lane three" }]);
    expect(P("shrink the Marketing sublane")).toEqual([{ op: "compressLane", laneRef: "sublane Marketing" }]);
    expect(P("shrink sublane Manager")).toEqual([{ op: "compressLane", laneRef: "sublane Manager" }]);
    expect(P("collapse the Sales lane")).toEqual([{ op: "compressLane", laneRef: "lane Sales" }]);
    expect(P("compact the Marketing lane")).toEqual([{ op: "compressLane", laneRef: "lane Marketing" }]);
    expect(P("compressed the Underwriters lane")).toEqual([{ op: "compressLane", laneRef: "lane Underwriters" }]);
  });

  it("a pool word, or no kind word, stays compressPool — the apply finds out what a bare name is", () => {
    expect(P("compress Sales")).toEqual([{ op: "compressPool", poolRef: "Sales" }]);
    expect(P("compress the Company pool")).toEqual([{ op: "compressPool", poolRef: "pool Company" }]);
    expect(P("compress this")).toEqual([{ op: "compressPool", poolRef: "this" }]);
  });

  it("the selection and “this” keep their words — a kind word in front would make them names", () => {
    expect(P("compress the selected lane")).toEqual([{ op: "compressLane", laneRef: "selected lane" }]);
    expect(P("compress this lane")).toEqual([{ op: "compressLane", laneRef: "this" }]);
    expect(P("compress the selected pool")).toEqual([{ op: "compressPool", poolRef: "selected pool" }]);
    // The mis-heard "selected" is repaired after "expand" too.
    expect(repairHeardWords("expand connected lane")).toBe("expand selected lane");
    expect(P("expand connected lane")).toEqual([{ op: "expandLane", laneRef: "selected lane" }]);
  });

  it("expand · grow · enlarge with a lane word is expandLane, with an optional “by N”", () => {
    expect(P("expand lane Sales")).toEqual([{ op: "expandLane", laneRef: "lane Sales" }]);
    expect(P("expand the Sales lane")).toEqual([{ op: "expandLane", laneRef: "lane Sales" }]);
    expect(P("grow the Sales lane")).toEqual([{ op: "expandLane", laneRef: "lane Sales" }]);
    expect(P("enlarge lane two")).toEqual([{ op: "expandLane", laneRef: "lane two" }]);
    expect(P("expanded the Sales lane")).toEqual([{ op: "expandLane", laneRef: "lane Sales" }]);
    expect(P("expand line three")).toEqual([{ op: "expandLane", laneRef: "lane three" }]);
    expect(P("expand lane Sales by 100")).toEqual([{ op: "expandLane", laneRef: "lane Sales", distance: 100 }]);
    expect(P("expand the Sales lane by 100 pixels")).toEqual([{ op: "expandLane", laneRef: "lane Sales", distance: 100 }]);
    expect(P("grow sublane Manager by 40px")).toEqual([{ op: "expandLane", laneRef: "sublane Manager", distance: 40 }]);
    // A name that ends in its lane word has no distance after it: "By" is the name's.
    expect(P("expand the Stand By lane")).toEqual([{ op: "expandLane", laneRef: "lane Stand By" }]);
  });

  it("a validated AI op is clamped as moveLane's is", () => {
    expect(validateOp({ op: "expandLane", laneRef: " Underwriters ", distance: 99.6 })).toEqual({ op: "expandLane", laneRef: "Underwriters", distance: 100 });
    expect(validateOp({ op: "expandLane", laneRef: "Underwriters", distance: -5 })).toEqual({ op: "expandLane", laneRef: "Underwriters", distance: 1 });
    expect(validateOp({ op: "expandLane", laneRef: "Underwriters" })).toEqual({ op: "expandLane", laneRef: "Underwriters" });
    expect(validateOp({ op: "compressLane", laneRef: "Lane 3" })).toEqual({ op: "compressLane", laneRef: "Lane 3" });
    expect(validateOp({ op: "compressLane" })).toBeNull();
    expect(validateOp({ op: "expandLane", distance: 64 })).toBeNull();
  });
});

describe("T4904 — a spoken kind word binds", () => {
  // A pool called Customer ABOVE a department whose lanes include Customer
  // Service. "The Customer lane" must never touch the pool.
  const world = () => [
    E({ id: "cp", type: "pool", label: "Customer", x: 0, y: 0, width: 900, height: 120, properties: { poolType: "black-box" } }),
    E({ id: "co", type: "pool", label: "Company", x: 0, y: 400, width: 900, height: 600, properties: { poolType: "white-box" } }),
    E({ id: "cs", type: "lane", label: "Customer Service", x: 36, y: 400, width: 864, height: 300, parentId: "co", properties: {} }),
    E({ id: "sa", type: "lane", label: "Sales", x: 36, y: 700, width: 864, height: 300, parentId: "co", properties: {} }),
    E({ id: "t1", type: "task", label: "Log Call", x: 200, y: 520, width: 100, height: 60, parentId: "cs", properties: {} }),
    E({ id: "t2", type: "task", label: "Quote Price", x: 200, y: 820, width: 100, height: 60, parentId: "sa", properties: {} }),
  ];

  it("the word travels to the front, where the resolver reads it — and only a lane can answer", () => {
    expect(parseCommand("compress the Customer lane")).toEqual([{ op: "compressLane", laneRef: "lane Customer" }]);
    expect(refKind("compressLane", "laneRef")).toBe("lane");
    expect(refKind("expandLane", "laneRef")).toBe("lane");
    expect(resolveRef("lane Customer", world(), null, [], { kind: "lane" })).toEqual({ id: "cs" });
    expect(resolveRef("Customer", world(), null, [], { kind: "lane" })).toEqual({ id: "cs" });
  });

  it("“compress the Customer lane” compresses Customer Service; the Customer pool is untouched", () => {
    const r = say("compress the Customer lane", { d: diagram(world()) });
    expect(r.ok, r.summary).toBe(true);
    expect(at(r.after, "cs").height).toBeLessThan(300);
    expect(at(r.after, "cp")).toEqual(world()[0]);
  });

  it("“expand the Customer lane” grows Customer Service; the pool above it does not move", () => {
    const r = say("expand the Customer lane", { d: diagram(world()) });
    expect(r.ok, r.summary).toBe(true);
    expect(at(r.after, "cs").height).toBe(300 + LANE_EXPAND_STEP);
    expect(at(r.after, "cp")).toEqual(world()[0]);
  });
});

describe("T4905 — “Compress lane.” with no name waits for it, then asks which", () => {
  it("the bare kind is held — compress and expand alike — and a named one runs at once", () => {
    for (const said of ["Compress lane.", "compress the lane", "Compress sublane.", "Expand the lane.", "expand lane", "Expand."]) {
      expect(isIncompleteCommand(said), said).toBe(true);
    }
    for (const said of ["compress lane Underwriters", "expand lane Underwriters", "expand the pool", "expand the pools"]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("the name after a pause joins the held verb", () => {
    expect(stitchFinals([{ text: "compress lane", atMs: 0 }, { text: "Underwriters", atMs: 3000 }], 4000)).toEqual(["compress lane Underwriters"]);
    expect(stitchFinals([{ text: "Expand", atMs: 0 }, { text: "lane Underwriters", atMs: 3000 }], 4000)).toEqual(["Expand lane Underwriters"]);
  });

  it("if none comes, it asks which lane, numbered — it never takes the newest", () => {
    const r = say("compress lane");
    expect(r.ops).toEqual([{ op: "compressLane", laneRef: "lane" }]);
    expect(r.h.screen).toContain("pick");
    expect(r.summary).toMatch(/which “lane”\? say a number \(1–3\)/);
    expect(r.after.elements, "nothing changed while it asks").toEqual(headlessDiagram(fixtureDiagram()).data.elements);
    // The answer re-runs the command on exactly the lane picked.
    const h = headlessDiagram(fixtureDiagram());
    const r2 = applyAssistOps(substituteRef(r.ops, "lane", "L3"), h.context());
    expect(r2.ok, r2.summary).toBe(true);
    expect(at(h.data, "L3").height).toBeLessThan(440);
    expect(at(h.data, "L2").height).toBe(440);
  });

  it("with exactly one lane selected, that is the one — the mouse says which", () => {
    const r = say("compress the lane", { selected: ["L2"] });
    expect(r.h.screen).not.toContain("pick");
    expect(at(r.after, "L2").height).toBe(124);
    const e = say("expand lane", { selected: ["S1"] });
    expect(at(e.after, "S1").height, "a selected sub-lane is a lane too").toBe(150 + LANE_EXPAND_STEP);
    const two = say("compress lane", { selected: ["L2", "L3"] });
    expect(two.h.screen, "two selected is no answer").toContain("pick");
  });

  it("“compress sublane” asks among the sub-lanes only", () => {
    const r = say("compress sublane");
    expect(r.summary).toMatch(/say a number \(1–2\)/);
  });

  it("the same for a bare “the pool”: asked, numbered — unless one pool is selected", () => {
    expect(say("compress the pool").summary).toMatch(/which “pool”\? say a number \(1–4\)/);
    const r = say("compress the pool", { selected: ["cust"] });
    expect(r.h.screen).not.toContain("pick");
    expect(r.summary).toBe("compressed Customer");
  });
});

describe("T4906 — what is NOT a lane command", () => {
  const ops = (s: string) => parseCommand(s)?.map((o) => o.op) ?? [];

  it("several lanes are the AI's, not a guess at one", () => {
    for (const said of ["compress all lanes", "compress the lanes", "compress all the lanes", "shrink every lane", "expand all lanes", "expand the lanes"]) {
      expect(ops(said), said).not.toContain("compressLane");
      expect(ops(said), said).not.toContain("compressPool");
      expect(ops(said), said).not.toContain("expandLane");
    }
  });

  it("“expand” with no lane word is not ours — a subprocess expands, a trailing “line” is a name", () => {
    for (const said of ["expand the subprocess", "expand Review", "expand the Production Line", "expand Sales by 100", "expand pool three", "expand the Customer pool", "grow Review Claim", "expand the gap"]) {
      expect(parseCommand(said), said).toBeNull();
    }
  });

  it("a distance it cannot read goes to the AI — never one Task row instead", () => {
    expect(parseCommand("expand lane Sales by a hundred")).toBeNull();
    expect(parseCommand("expand the Sales lane by lots")).toBeNull();
    expect(parseCommand("expand lane Sales by 0")).toBeNull();
  });

  it("“expand the pools” still widens every pool", () => {
    for (const said of ["expand the pools", "grow the pool", "expand all the pools", "enlarge the pools"]) {
      expect(parseCommand(said), said).toEqual([{ op: "extendPools" }]);
    }
  });
});

describe("T4907 — compress: the geometry (Paul, 2026-09-26: the bottom edge moves)", () => {
  it("Underwriters: the top stays, the content slides up to ½ Task under it, the lanes below close up, the pool shrinks", () => {
    const d = fixtureDiagram();
    const after = compress(d, "L2");
    expect([at(after, "L2").y, at(after, "L2").height]).toEqual([300, 124]);
    expect(at(after, "t4").y, "½ Task under the top").toBe(332);
    expect(at(after, "g").y, "the content moves together").toBe(495 - 158);
    expect([at(after, "L3").y, at(after, "L3").height], "Lane 3 moves up by what was freed, its height kept").toEqual([424, 440]);
    expect(at(after, "t6").y, "and its content with it").toBe(930 - 316);
    expect(at(after, "p").height).toBe(1180 - 316);
    for (const id of ["L1", "S1", "S2", "t1", "t3", "p"]) expect(at(after, id).y, `${id}, above, stays`).toBe(at(d, id).y);
    for (const id of ["cust", "sys", "pool3"]) expect(at(after, id), `${id}, below, stays put`).toEqual(at(d, id));
    expectTiled(after);
    expectContentInside(after);
  });

  it("a lane with sub-lanes is fitted one sub-lane at a time", () => {
    const after = compress(fixtureDiagram(), "L1");
    expect([at(after, "S1").y, at(after, "S1").height]).toEqual([0, 122]);
    expect([at(after, "S2").y, at(after, "S2").height], "Sub 2 closes up under Sub 1").toEqual([122, 142]);
    expect(at(after, "t3").y, "and its content with it").toBe(180 - 28);
    expect(at(after, "L1").height).toBe(264);
    expect(at(after, "L2").y).toBe(264);
    expect(at(after, "p").height).toBe(1144);
    expectTiled(after);
    expectContentInside(after);
  });

  it("a sub-lane on its own: its later sub-lanes, its parent and the lanes below close up", () => {
    const after = compress(fixtureDiagram(), "S1");
    expect(at(after, "S1").height).toBe(122);
    expect(at(after, "S2").y).toBe(122);
    expect(at(after, "L1").height).toBe(272);
    expect(at(after, "L2").y).toBe(272);
    expectTiled(after);
  });

  it("a second compress changes nothing", () => {
    for (const id of ["L1", "L2", "L3", "S1", "S2"]) {
      const once = compress(fixtureDiagram(), id);
      expect(fitLaneToContent(once.elements, id), id).toBe(once.elements);
      expect(compress(once, id).elements, id).toEqual(once.elements);
    }
  });

  it("it never makes a lane taller: content nearer an edge than ½ Task stays where it is", () => {
    const els = [
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 200, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 100, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 100, width: 864, height: 100, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "Load Van", x: 200, y: 10, width: 100, height: 80, parentId: "a", properties: {} }),
    ];
    const d = diagram(els);
    expect(compress(d, "a"), "a lane already tighter than the fit is left alone").toBe(d);
  });

  it("an empty lane fits its name; never below it", () => {
    const name = "Quality Assurance Team";
    const els = [
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 700, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: name, x: 36, y: 0, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 400, width: 864, height: 300, parentId: "p", properties: {} }),
    ];
    const after = compress(diagram(els), "a");
    expect(at(after, "a").height).toBe(laneMetrics(name, 14).minHeight);
    expectTiled(after);
  });

  it("the POOL's name is a floor too — the lane's bottom band keeps what it needs", () => {
    // The prototype left this pool 128 px tall under a 280 px name (check-B).
    const poolName = "Accounts Payable Department";
    const els = [
      E({ id: "p", type: "pool", label: poolName, x: 0, y: 0, width: 900, height: 500, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Clerks", x: 36, y: 0, width: 864, height: 500, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "Enter Invoice", x: 200, y: 200, width: 100, height: 64, parentId: "a", properties: {} }),
    ];
    const after = compress(diagram(els), "a");
    const floor = poolMetrics(poolName, 16).minHeight;
    expect(at(after, "p").height).toBe(floor);
    expect(at(after, "a").height).toBe(floor);
    expect(at(after, "t").y, "the content still moved up").toBe(32);
    expectTiled(after);
  });

  it("a stamped `type: \"sublane\"` is fitted like a nested lane", () => {
    const els = stampedWorld();
    const after = compress(diagram(els), "A");
    expect(at(after, "A1").height).toBe(151);   // "Senior Assessors" needs 151; its task needs 32 + 64 + 32
    expect(at(after, "A2").height).toBe(151);
    expect(at(after, "A").height).toBe(302);
    expect(at(after, "a2t").y, "Junior Assessors' task moved up with its band").toBe(151 + 32);
    expectTiled(after);
    expectContentInside(after);
  });

  it("free notes move with what they lie in: slid with the content, carried with the lanes below", () => {
    const d = fixtureDiagram();
    d.elements.push(
      E({ id: "n2", type: "text-annotation", label: "Check limits", x: 400, y: 600, width: 120, height: 40, properties: {} }),
      E({ id: "n3", type: "text-annotation", label: "Pay same day", x: 400, y: 1040, width: 120, height: 40, properties: {} }),
    );
    const after = compress(d, "L2");
    // The note under Underwriters' tasks is content: it counts for the bottom, and slides.
    expect(at(after, "n2").y).toBe(600 - 158);
    expect(at(after, "L2").height).toBe(640 - 158 + 32 - 300);
    const freed = 440 - at(after, "L2").height;
    expect(at(after, "n3").y, "Lane 3's note moved up with Lane 3").toBe(1040 - freed);
    expect(at(after, "n2").parentId, "and a note is still nobody's").toBeUndefined();
  });

  it("pure: the input is never changed", () => {
    const els = fixtureElements();
    const copy = structuredClone(els);
    fitLaneToContent(els, "L1");
    setBandHeightAtBottom(els, "L1", 500);
    expect(els).toEqual(copy);
  });
});

/** A department whose Assessors lane holds two STAMPED sub-lanes (the AI converter's shape). */
function stampedWorld(): DiagramElement[] {
  return [
    E({ id: "P", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: 600, properties: { poolType: "white-box" } }),
    E({ id: "A", type: "lane", label: "Assessors", x: 36, y: 0, width: 864, height: 400, parentId: "P", properties: {} }),
    E({ id: "A1", type: "sublane", label: "Senior Assessors", x: 72, y: 0, width: 828, height: 200, parentId: "A", properties: {} }),
    E({ id: "A2", type: "sublane", label: "Junior Assessors", x: 72, y: 200, width: 828, height: 200, parentId: "A", properties: {} }),
    E({ id: "B", type: "lane", label: "Support", x: 36, y: 400, width: 864, height: 200, parentId: "P", properties: {} }),
    E({ id: "a1t", type: "task", label: "Approve Claim", x: 200, y: 60, width: 100, height: 64, parentId: "A1", properties: {} }),
    E({ id: "a2t", type: "task", label: "Draft Report", x: 200, y: 260, width: 100, height: 64, parentId: "A2", properties: {} }),
  ];
}

describe("T4908 — expand: one Task row at the bottom, or the number said", () => {
  it("+64 by default; the lanes below move down; the pools below are pushed by the 100-px rule", () => {
    const d = fixtureDiagram();
    const after = expand(d, "L2", LANE_EXPAND_STEP);
    expect(LANE_EXPAND_STEP).toBe(64);
    expect([at(after, "L2").y, at(after, "L2").height]).toEqual([300, 504]);
    expect(at(after, "t4").y, "its content does not move").toBe(490);
    expect(at(after, "L3").y).toBe(804);
    expect(at(after, "p").height).toBe(1244);
    // Customer sat 100 below the pool; 100 − 64 < 100, so every pool below moves.
    expect(at(after, "cust").y).toBe(1344);
    expect(at(after, "sys").y).toBe(1504);
    expect(at(after, "pool3").y).toBe(1664);
    expectTiled(after);
  });

  it("the LAST sub-lane takes the growth — the other dividers stay put", () => {
    const after = expand(fixtureDiagram(), "L1", 64);
    expect([at(after, "S1").y, at(after, "S1").height]).toEqual([0, 150]);
    expect([at(after, "S2").y, at(after, "S2").height]).toEqual([150, 214]);
    expect(at(after, "t3").y).toBe(180);
    expect(at(after, "L1").height).toBe(364);
    expectTiled(after);
  });

  it("a sub-lane grows and its later sub-lanes, its parent and the lanes below make room", () => {
    const after = expand(fixtureDiagram(), "S1", 40);
    expect(at(after, "S1").height).toBe(190);
    expect(at(after, "S2").y).toBe(190);
    expect(at(after, "t3").y).toBe(220);
    expect(at(after, "L1").height).toBe(340);
    expectTiled(after);
  });

  it("a stamped sub-lane stack takes the growth in its last band too", () => {
    const after = expand(diagram(stampedWorld()), "A", 100);
    expect(at(after, "A2").height).toBe(300);
    expect(at(after, "B").y).toBe(500);
    expectTiled(after);
  });

  it("a lane that is not there, or nothing to add, changes nothing", () => {
    const d = fixtureDiagram();
    expect(expand(d, "nope", 64)).toBe(d);
    expect(expand(d, "L2", 0)).toBe(d);
    expect(compress(d, "t1"), "a task is not a lane").toBe(d);
  });
});

describe("T4909 — renaming a lane that has sub-lanes to a long name leaves no strip", () => {
  it("the last sub-lane takes the growth, so the stack still fills the lane", () => {
    // Was: Claims Team 0..445, Sub 1 0..150, Sub 2 150..300 — a 145 px strip
    // that no sub-lane covered (check-B §2b).
    const long = "Claims Team And Everybody Who Works In It Every Day";
    const after = reducer(fixtureDiagram(), { type: "UPDATE_LABEL", payload: { id: "L1", label: long } });
    expect(at(after, "L1").height).toBe(laneMetrics(long, 14).minHeight);
    expect(at(after, "S1").height, "the first sub-lane keeps its size").toBe(150);
    expectTiled(after);
  });
});

describe("T4910 — the shared helpers see a stamped sub-lane, on every mouse path they serve", () => {
  it("dragging the divider below a lane with stamped sub-lanes: the last one takes it, and the drag stops at its floor", () => {
    const d = diagram(stampedWorld());
    const down = reducer(d, { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy: 50 } });
    expect(at(down, "A").height).toBe(450);
    expect([at(down, "A1").height, at(down, "A2").height]).toEqual([200, 250]);
    expectTiled(down);
    const up = reducer(d, { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy: -1000 } });
    expect(at(up, "A2").height, "stopped at what Junior Assessors needs").toBe(laneMetrics("Junior Assessors", 14).minHeight);
    expectTiled(up);
  });

  it("a lane drop carved out of a lane with stamped sub-lanes re-fits them (the reducer's and the ghost's geometry)", () => {
    const after = carveGeometry(stampedWorld(), { donorId: "A", edge: "last", give: 40 }, 16, 14);
    const a = after.find((e) => e.id === "A")!, a2 = after.find((e) => e.id === "A2")!;
    expect(a.height).toBe(360);
    expect(a2.y + a2.height).toBe(a.y + a.height);
  });

  it("dragging the pool's bottom edge up stops where the stamped sub-lanes' names need it", () => {
    // Support on top, Assessors (two stamped sub-lanes) at the bottom, nothing inside.
    const els = [
      E({ id: "P", type: "pool", label: "Company", x: 0, y: 0, width: 900, height: 600, properties: { poolType: "white-box" } }),
      E({ id: "B", type: "lane", label: "Support", x: 36, y: 0, width: 864, height: 200, parentId: "P", properties: {} }),
      E({ id: "A", type: "lane", label: "Assessors", x: 36, y: 200, width: 864, height: 400, parentId: "P", properties: {} }),
      E({ id: "A1", type: "sublane", label: "Senior Assessors", x: 72, y: 200, width: 828, height: 200, parentId: "A", properties: {} }),
      E({ id: "A2", type: "sublane", label: "Junior Assessors", x: 72, y: 400, width: 828, height: 200, parentId: "A", properties: {} }),
    ];
    const after = reducer(diagram(els), { type: "RESIZE_ELEMENT", payload: { id: "P", x: 0, y: 0, width: 900, height: 250, wasWhiteBoxAtResizeStart: true } });
    const need = laneMetrics("Senior Assessors", 14).minHeight + laneMetrics("Junior Assessors", 14).minHeight;
    expect(at(after, "A").height, "Assessors keeps what its stamped sub-lanes' names need").toBeGreaterThanOrEqual(need);
  });

  it("a step kept in a stamped sub-lane grows it, rather than leaving it hanging out", () => {
    const after = reducer(diagram(stampedWorld()), {
      type: "ADD_ELEMENT",
      payload: { symbolType: "task", position: { x: 500, y: 390 }, id: "k", initial: { parentId: "A2", keepInLane: true } },
    });
    const k = at(after, "k"), a2 = at(after, "A2");
    expect(k.y + k.height + 8).toBeLessThanOrEqual(a2.y + a2.height + 1e-6);
    expectTiled(after);
  });
});

describe("T4911 — L4: the checks are written from the sentence, and catch a wrong edit", () => {
  const d = fixtureDiagram();
  const fitted = compress(d, "L2");
  const grown = expand(d, "L1", 64);
  const edit = (base: DiagramData, id: string, patch: Partial<DiagramElement>): DiagramData =>
    ({ ...base, elements: base.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) });
  const cl = (after: DiagramData, id = "L2") => checkEffect({ op: "compressLane", laneRef: "x" }, d, after, { laneRef: id })!;
  const el = (after: DiagramData, distance?: number, id = "L1") => checkEffect({ op: "expandLane", laneRef: "x", ...(distance ? { distance } : {}) }, d, after, { laneRef: id })!;

  it("the real edits pass — a lane, a lane with sub-lanes, a sub-lane, and compress pool on a lane", () => {
    expect(cl(fitted)).toEqual({ ok: true, detail: "" });
    expect(cl(compress(d, "L1"), "L1").ok).toBe(true);
    expect(cl(compress(d, "S2"), "S2").ok).toBe(true);
    expect(el(grown).ok).toBe(true);
    expect(el(expand(d, "L2", 100), 100, "L2").ok).toBe(true);
    expect(checkEffect({ op: "compressPool", poolRef: "Underwriters" }, d, fitted, { poolRef: "L2" })!.ok).toBe(true);
  });

  it("compress: taller, under its name, content outside, a broken stack, a lane above moved, the top moved — each fails", () => {
    expect(cl(edit(fitted, "L2", { height: 450 })).detail).toMatch(/never makes a lane taller/);
    expect(cl(edit(fitted, "L2", { height: 60 })).detail).toMatch(/under the \d+ its name needs/);
    expect(cl(edit(fitted, "t4", { y: 700 })).detail).toMatch(/no longer inside/);
    expect(cl(edit(fitted, "L2", { y: 310 })).detail).toMatch(/top of Underwriters moved/);
    expect(cl(edit(fitted, "L1", { height: 290 })).detail).toMatch(/Claims Team, above Underwriters, moved/);
    const brokenStack = compress(d, "L1");
    expect(cl(edit(brokenStack, "S2", { height: 100 }), "L1").detail).toMatch(/end at/);
  });

  it("compress: a lane left loose around its content fails — the no-op that used to pass", () => {
    expect(cl(d).detail).toMatch(/190px above its content — more than half a Task/);
    // Content moved up, but the bottom left where no name needs it.
    expect(cl(edit(fitted, "L2", { height: 174 })).detail).toMatch(/82px under its content — more than half a Task, and no name needs it/);
    // compress pool, resolved to a LANE, is checked as the lane: the old check
    // passed any "pool" that had not grown.
    expect(checkEffect({ op: "compressPool", poolRef: "Underwriters" }, d, d, { poolRef: "L2" })!.ok).toBe(false);
  });

  it("compress: the pool below its own name fails", () => {
    const poolName = "Accounts Payable Department";
    const els = [
      E({ id: "p", type: "pool", label: poolName, x: 0, y: 0, width: 900, height: 500, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Clerks", x: 36, y: 0, width: 864, height: 500, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "Enter Invoice", x: 200, y: 200, width: 100, height: 64, parentId: "a", properties: {} }),
    ];
    const before = diagram(els);
    const tooShort = diagram(els.map((e) => (e.id === "p" || e.id === "a" ? { ...e, height: 128 } : e.id === "t" ? { ...e, y: 32 } : e)));
    const r = checkEffect({ op: "compressLane", laneRef: "Clerks" }, before, tooShort, { laneRef: "a" })!;
    expect(r.detail).toMatch(/Accounts Payable Department is 128 tall, under the/);
    expect(checkEffect({ op: "compressLane", laneRef: "Clerks" }, before, compress(before, "a"), { laneRef: "a" })!.ok).toBe(true);
  });

  it("expand: the wrong amount, a stack that no longer fills it, content that moved — each fails", () => {
    expect(el(expand(d, "L1", 40)).detail).toMatch(/grew by 40px, not 64px/);
    expect(el(edit(grown, "S2", { height: 150 })).detail).toMatch(/end at/);
    expect(el(edit(grown, "t1", { y: 94 })).detail).toMatch(/Review Claim moved inside Claims Team/);
  });

  it("no gold flash, as compress pool has none — the whole band below moves, and a flash would say nothing", () => {
    expect(opFlashes("compressLane")).toBe(false);
    expect(opFlashes("expandLane")).toBe(false);
    expect(opFlashes("compressPool")).toBe(false);
  });
});

describe("T4912 — parse and apply, through the headless editor, on the test diagram", () => {
  it("“compress the Underwriters lane”", () => {
    const r = say("compress the Underwriters lane");
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("compressed Underwriters to its content");
    expect(at(r.after, "L2").height).toBe(124);
  });

  it("“compress lane Claims Team” — each sub-lane fitted", () => {
    const r = say("compress lane Claims Team");
    expect(r.ok, r.summary).toBe(true);
    expect([at(r.after, "S1").height, at(r.after, "S2").height, at(r.after, "L1").height]).toEqual([122, 142, 264]);
  });

  it("“expand lane Underwriters by 100”", () => {
    const r = say("expand lane Underwriters by 100");
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toBe("made Underwriters 100px taller");
    expect(at(r.after, "L2").height).toBe(540);
    expect(at(r.after, "cust").y, "the pools below pushed").toBe(1380);
  });

  it("“compress Underwriters”, no kind word: the name is a lane, so the lane is compressed (it used to be refused)", () => {
    const r = say("compress Underwriters");
    expect(r.ops).toEqual([{ op: "compressPool", poolRef: "Underwriters" }]);
    expect(r.ok, r.summary).toBe(true);
    expect(at(r.after, "L2").height).toBe(124);
    expect(r.summary).not.toMatch(/isn't a pool|say “compress/);
  });

  it("“compress lane three” and “compress pool three” each find the one they name", () => {
    const lane = say("compress lane three");
    expect(lane.h.screen).not.toContain("pick");
    expect(at(lane.after, "L3").height).toBe(124);
    const pool = say("compress pool three");
    expect(pool.h.screen).not.toContain("pick");
    expect(pool.summary).toBe("compressed Pool 3");
  });

  it("a lane already fitted says so, and nothing changes", () => {
    const once = say("compress the Underwriters lane");
    const again = say("compress the Underwriters lane", { d: once.after });
    expect(again.ok).toBe(false);
    expect(again.summary).toBe("Underwriters is already fitted to its content");
    expect(again.after.elements).toEqual(once.after.elements);
  });

  it("“expand the Customer lane” on a diagram whose Customer is a POOL touches nothing", () => {
    const r = say("expand the Customer lane");
    expect(r.ok).toBe(false);
    expect(at(r.after, "cust")).toEqual(at(fixtureDiagram(), "cust"));
    expect(r.after.elements).toEqual(headlessDiagram(fixtureDiagram()).data.elements);
  });

  it("the ops are undoable, one entry each", () => {
    const h = headlessDiagram(fixtureDiagram());
    const start = structuredClone(h.data.elements);
    applyAssistOps(parseCommand("compress the Underwriters lane")!, h.context());
    applyAssistOps(parseCommand("expand lane Lane 3")!, h.context());
    h.actions.undo();
    h.actions.undo();
    expect(h.data.elements).toEqual(start);
  });
});

describe("T4913 — “expand” is a command verb now: what that reaches", () => {
  it("is in the one verb list, the greedy guard and the selected-word repair", () => {
    expect(COMMAND_VERBS).toContain("expand");
    expect(looksLikeAnotherCommand("Expand the Sales lane")).toBe(true);
    // "put Expand the Sales lane" — the recogniser dropped a pause — is not a task called that.
    const put = parseCommand("put Expand the Sales lane");
    expect(put?.some((o) => o.op === "add" && /expand/i.test((o as { label?: string }).label ?? "")) ?? false).toBe(false);
  });

  it("a name that runs on into “expand the …” is two sentences, not one name", () => {
    expect(parseBoundaryEventPhrase("add a boundary event called Timeout expand the lane")).toBe("unreadable");
    expect(repairAddWord("and a task, expand the lane").corrected).toBe(false);
    expect(hasCommandAfterName("Review Claim expand Underwriters")).toBe(true);
  });

  it("a name that merely CONTAINS the word still works", () => {
    expect(parseCommand("add a task called Expand Market")).toEqual([{ op: "add", symbolType: "task", label: "Expand Market" }]);
    expect(parseCommand("rename Task 1 to Expand Market")).toEqual([{ op: "rename", ref: "Task 1", label: "Expand Market" }]);
  });
});

describe("T4914 — wiring: one setter, one settle, one default", () => {
  const hook = src("app/hooks/useDiagram.ts");
  const caseOf = (name: string) => {
    const start = hook.indexOf(`    case "${name}": {`);
    expect(start, name).toBeGreaterThan(-1);
    return hook.slice(start, hook.indexOf("\n    case \"", start + 10));
  };

  it("growLaneToHeight is a grow-only wrapper round the one setter; growLaneAtTop carries the one content set", () => {
    const grow = hook.slice(hook.indexOf("function growLaneToHeight("), hook.indexOf("\n}\n", hook.indexOf("function growLaneToHeight(")));
    expect(grow).toContain("lane.height >= minHeight");
    // The setter now also takes which sub-lane grows (growLaneAtTop's room is at the top).
    expect(grow).toContain("return setBandHeightAtBottom(baseElements, laneId, minHeight, { edge });");
    expect(grow).not.toContain("collectDesc");
    const atTop = hook.slice(hook.indexOf("function growLaneAtTop("), hook.indexOf("\n}\n", hook.indexOf("function growLaneAtTop(")));
    expect(atTop).toContain("bandContentIds(elements, id)");
    expect(atTop, "the room at the top goes to the FIRST sub-lane").toContain(`"first"`);
  });

  it("the two reducer cases use laneFit.ts and settle ONCE; both re-derive lane membership", () => {
    expect(caseOf("COMPRESS_LANE")).toContain("fitLaneToContent(");
    expect(caseOf("EXPAND_LANE")).toContain("setBandHeightAtBottom(");
    for (const name of ["COMPRESS_LANE", "EXPAND_LANE"]) {
      expect(caseOf(name).match(/settleGrowth\(/g), name).toHaveLength(1);
      expect(caseOf(name), name).not.toMatch(/recomputeAllConnectors|cascadePoolsBelow/);
    }
    // Compress re-derives ownership BEFORE its fit (the fit moves a band's content
    // with it), so it left the after-the-action pass: a fitted lane stays untouched.
    const compress = caseOf("COMPRESS_LANE");
    expect(compress.indexOf("reconcileLaneMembership(")).toBeGreaterThan(-1);
    expect(compress.indexOf("reconcileLaneMembership(")).toBeLessThan(compress.indexOf("fitLaneToContent("));
    const reconcile = hook.slice(hook.indexOf("const LANE_RECONCILE_ACTIONS"), hook.indexOf("]);", hook.indexOf("const LANE_RECONCILE_ACTIONS")));
    expect(reconcile).toContain(`"EXPAND_LANE"`);
    expect(reconcile).not.toContain(`"COMPRESS_LANE"`);
  });

  it("one list of expand verbs, and the lane words from containerWords.ts — nowhere spelled again", () => {
    expect(EXPAND_VERBS).toEqual(["expand", "grow", "enlarge"]);
    expect(src("app/api/ai/command/route.ts")).not.toContain("expand/grow/enlarge");
    expect(src("app/lib/assist/commandGrammar.ts")).not.toMatch(/widen\|expand\|grow/);
    for (const file of ["app/lib/assist/compressPhrase.ts", "app/lib/assist/incompleteCommand.ts"]) {
      const code = src(file).replace(/^\s*(?:\/\/|\*).*$/gm, "");
      expect(code, file).not.toMatch(/lane\|/);
      expect(code, file).not.toMatch(/expand\(\?:s\|ed/);
    }
  });

  it("the descendant walk is defined once, in containment.ts", () => {
    expect(hook).not.toContain("export function getAllDescendantIds(");
    expect(src("app/lib/diagram/containment.ts")).toContain("export function getAllDescendantIds(");
    expect(src("app/lib/diagram/laneFit.ts")).toContain(`from "./containment"`);
  });

  it("the apply layer resolves by the kind table, and one Task row is laneFit's constant", () => {
    const apply = src("app/lib/assist/applyAssistOps.ts");
    const at = apply.indexOf(`op.op === "compressLane" || op.op === "expandLane"`);
    expect(at).toBeGreaterThan(-1);
    const branch = apply.slice(at, at + 1600);
    expect(branch).toContain(`resolveField(op, "laneRef", { strict: true })`);
    expect(branch).toContain("op.distance ?? LANE_EXPAND_STEP");
    expect(apply, "the old refusal is gone").not.toContain("say “compress the");
  });

  it("the card, the AI prompt and the docs name both commands", () => {
    const lines = COMMAND_CATALOG.find((f) => f.family === "Lanes and sub-lanes")!.items.map((i) => i.does);
    expect(lines.some((l) => l.startsWith("Compress a lane to its content"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Make a lane taller: one Task row, or by a number"))).toBe(true);
    const route = src("app/api/ai/command/route.ts");
    expect(route).toContain(`{ "op":"compressLane", "laneRef": <lane name> }`);
    expect(route).toContain(`{ "op":"expandLane", "laneRef": <lane name>, "distance"?: number }`);
    expect(route).toContain("compress lane <lane>");
    const docs = src("docs/voice-assist-commands.md");
    expect(docs).toContain("**Compress a lane**");
    expect(docs).toContain("**Make a lane taller**");
  });

  it("the card's lane examples are in the test diagram's names, and each finds one lane", () => {
    const item = (prefix: string) => COMMAND_CATALOG.flatMap((f) => f.items).find((i) => i.does.startsWith(prefix))!;
    for (const said of [...item("Compress a lane").say, ...item("Make a lane taller").say]) {
      const op = parseCommand(said)![0] as AssistOp & { laneRef: string };
      expect(["compressLane", "expandLane"], said).toContain(op.op);
      const r = resolveRef(op.laneRef, fixtureElements(), null, [], { kind: refKind(op.op, "laneRef") });
      expect(r && "id" in r, `${said} names one lane of the test diagram`).toBe(true);
    }
  });
});

describe("T4915 — the generated corpus says the lane commands, and has a new seed", () => {
  const cases = generateCases({ count: 600, world: fixtureElements() });
  const LANE_WORD = /\b(?:lanes?|sublanes?|line|sub)\b/i;

  it("both families are generated, always WITH a lane word, and Claims Team (sub-lanes) is among them", () => {
    for (const family of ["compressLane", "expandLane"]) {
      const fam = cases.filter((c) => c.family === family);
      expect(fam.length, family).toBeGreaterThan(5);
      for (const c of fam) expect(c.utterance, c.id).toMatch(LANE_WORD);
      expect(fam.some((c) => Object.values(c.refs).includes("L1")), `${family} names Claims Team`).toBe(true);
    }
    const byN = cases.filter((c) => c.family === "expandLane" && / by \d+/.test(c.utterance));
    expect(byN.length).toBeGreaterThan(0);
    for (const c of byN) expect((c.ops[0] as { distance?: number }).distance, c.utterance).toBeGreaterThan(0);
  });

  it("compress pool is said more ways: the pool nobody renamed, the pool word, “compact”, “compressed”", () => {
    const said = cases.filter((c) => c.family === "compressPool").map((c) => c.utterance);
    expect(said.some((s) => /pool three|Pool 3/.test(s)), "Pool 3").toBe(true);
    expect(said.some((s) => /^compress the .+ pool$/.test(s)), "the X pool").toBe(true);
    expect(said.some((s) => /^compact /.test(s)), "compact").toBe(true);
    expect(said.some((s) => /^compressed /.test(s)), "compressed").toBe(true);
  });

  it("the realistic seed has a new name, so a recorded #35 still means the sentence recorded", () => {
    expect(DEFAULT_CORPUS_SEED).not.toBe("dgx-voice-2026-09-realistic");
    expect(fixtureElements().find((e) => e.id === "pool3")?.label).toBe("Pool 3");
  });
});

describe("T4916 — the two prod SQL patches (written, never run here)", () => {
  const between = (sql: string, tag: string) => [...sql.matchAll(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`, "g"))].map((m) => m[1]);

  it("the User Guide patch writes exactly the line the seed carries, guarded, in one transaction", () => {
    const patch = src("scripts/sql/patch-voice-assist-lane-compress-expand.sql");
    const seed = src("scripts/sql/seed-voice-assist-content.sql");
    const [oldText] = between(patch, "OLD"), [newText] = between(patch, "NEW");
    expect(newText.startsWith(oldText), "the anchor phrase is kept, the line added after it").toBe(true);
    expect(seed).toContain(newText);
    expect(patch).toMatch(/NOT LIKE '%"compress the Sales lane" · "expand lane Picking by 100"%'/);
    expect(patch.indexOf("BEGIN;")).toBeGreaterThan(-1);
    expect(patch.indexOf("COMMIT;")).toBeGreaterThan(patch.indexOf(`UPDATE "HelpSection"`));
    expect(patch.slice(patch.indexOf("COMMIT;"))).toMatch(/\bSELECT\b/);
  });

  it("the AI-rules patch adds V1.06 and V2.06 and edits V1.01 — guarded on content, never a reseed", () => {
    const patch = src("scripts/sql/patch-assist-rules-lane-compress-expand.sql");
    const code = patch.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/\b(?:DELETE|INSERT|TRUNCATE|DROP)\b/i);
    expect(code.match(/UPDATE "DiagramRules"/g)).toHaveLength(3);
    expect(code).toContain(`rules NOT LIKE '%V1.06:%'`);
    expect(code).toContain(`rules NOT LIKE '%V2.06:%'`);
    expect(patch.slice(patch.indexOf("COMMIT;"))).toMatch(/\bSELECT\b/);
    // The seed script carries the same words, so a fresh database says the same.
    const seedRules = (JSON.parse(`"${src("scripts/seed-diagram-rules.cjs").match(/"assist": "((?:[^"\\]|\\.)*)"/)![1]}"`) as string);
    for (const text of between(patch, "NEW")) {
      for (const line of text.split("\n")) expect(seedRules, line.slice(0, 40)).toContain(line);
    }
    for (const text of between(patch, "OLD")) expect(seedRules.includes(text) || seedRules.includes(text.replace(/\.$/, "")), text.slice(0, 40)).toBe(true);
  });
});

// ─── The adversarial review of 2026-09-26 ──────────────────────────────────

describe("T4917 — room made at the TOP of a lane with sub-lanes goes to its first sub-lane", () => {
  // A step kept in a lane, placed above its top: the lane makes room at the
  // top (growLaneAtTop). The shared setter grew the LAST sub-lane and the
  // sub-lanes were carried down as well, so Sub 2 ran 38.5 px into Underwriters.
  const keepAtTop = (d: DiagramData, parentId: string) => reducer(d, {
    type: "ADD_ELEMENT",
    payload: { symbolType: "task", position: { x: 500, y: 2 }, id: "k", initial: { parentId, keepInLane: true } },
  });

  it("nested sub-lanes: the stack still fills the lane, and the lane below is not run into", () => {
    const after = keepAtTop(fixtureDiagram(), "L1");
    const l1 = at(after, "L1");
    const grew = l1.height - 300;
    expect(grew, "the lane made room").toBeGreaterThan(0);
    expect(at(after, "L2").y, "Underwriters starts where Claims Team ends").toBe(l1.y + l1.height);
    expect(at(after, "S1").height, "the first sub-lane took the room").toBe(150 + grew);
    expect(at(after, "S2").height, "the last kept its size").toBe(150);
    expect(at(after, "t3").y - at(after, "S2").y, "Sub 2's content kept its place in it").toBe(180 - 150);
    expect(at(after, "t1").y - at(after, "S1").y, "Sub 1's content moved down with the room").toBe(30 + grew);
    expectTiled(after);
    expectContentInside(after);
  });

  it("stamped sub-lanes the same", () => {
    const after = keepAtTop(diagram(stampedWorld()), "A");
    const a = at(after, "A");
    expect(a.height).toBeGreaterThan(400);
    expect(at(after, "B").y).toBe(a.y + a.height);
    expect(at(after, "A2").height).toBe(200);
    expectTiled(after);
    expectContentInside(after);
  });
});

/** A crew lane with a rework loop dragged 60 px under its row. */
function loopWorld(): { d: DiagramData; loop: Connector } {
  const loop = {
    id: "loop", sourceId: "t2", targetId: "t1", type: "sequence", sourceSide: "bottom", targetSide: "bottom",
    directionType: "directed", routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false,
    waypoints: [{ x: 450, y: 214 }, { x: 450, y: 274 }, { x: 250, y: 274 }, { x: 250, y: 214 }],
  } as unknown as Connector;
  const d = {
    ...diagram([
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 800, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 400, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "t1", type: "task", label: "Load", x: 200, y: 150, width: 100, height: 64, parentId: "a", properties: {} }),
      E({ id: "t2", type: "task", label: "Check", x: 400, y: 150, width: 100, height: 64, parentId: "a", properties: {} }),
      E({ id: "u", type: "task", label: "File", x: 300, y: 550, width: 100, height: 64, parentId: "b", properties: {} }),
    ]),
    connectors: [loop],
  };
  return { d, loop };
}

describe("T4918 — a lane's content is its shapes AND the routes drawn between them", () => {
  it("a rework loop dragged under the row: the bottom stays ½ Task under the loop, and the loop keeps its shape", () => {
    const { d } = loopWorld();
    const after = compress(d, "a");
    const a = at(after, "a");
    expect(at(after, "t1").y, "the row slid up to ½ Task under the top").toBe(32);
    expect(after.connectors[0].waypoints.map((p) => p.y), "the loop moved with its tasks, its shape kept").toEqual([96, 156, 156, 96]);
    expect(a.y + a.height, "½ Task under the loop, not under the tasks").toBe(156 + 32);
    expect(checkEffect({ op: "compressLane", laneRef: "Crew" }, d, after, { laneRef: "a" })).toEqual({ ok: true, detail: "" });
    expect(compress(after, "a"), "a second compress changes nothing").toBe(after);
  });

  it("L4: fitted to the shapes alone, the loop lies in the lane below — and the check says so", () => {
    const { d, loop } = loopWorld();
    const shapesOnly = fitLaneToContent(d.elements, "a");   // no routes given: the fit as it was
    const slid = 150 - 32;
    const clipped = { ...d, elements: shapesOnly, connectors: [{ ...loop, waypoints: loop.waypoints.map((p) => ({ x: p.x, y: p.y - slid })) }] };
    expect(at(clipped, "a").height).toBe(128);
    expect(checkEffect({ op: "compressLane", laneRef: "Crew" }, d, clipped, { laneRef: "a" })!.detail).toMatch(/the flow from Check to Load is no longer inside Crew/);
  });

  it("after a compress every connector still ends on its shapes — the one settle moved them", () => {
    const conn = (id: string, s: string, t: string, type = "sequence") => ({
      id, sourceId: s, targetId: t, type, sourceSide: "right", targetSide: "left", directionType: "directed",
      routingType: "rectilinear", sourceInvisibleLeader: false, targetInvisibleLeader: false, waypoints: [],
    } as unknown as Connector);
    const d0 = fixtureDiagram();
    d0.connectors.push(conn("m1", "t6", "cust", "messageBPMN"), conn("m2", "t1", "sys", "messageBPMN"), conn("x1", "t3", "t5"));
    const d = reducer(d0, { type: "REROUTE_ALL" });
    const off = (p: { x: number; y: number }, r: DiagramElement) =>
      Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
    for (const id of ["L1", "L2", "L3", "S1", "S2"]) {
      const after = compress(d, id);
      expect(after, id).not.toBe(d);
      for (const c of after.connectors) {
        if (!c.waypoints.length) continue;
        expect(off(c.waypoints[0], at(after, c.sourceId)), `${id}: ${c.id} starts on ${c.sourceId}`).toBeLessThanOrEqual(3);
        expect(off(c.waypoints[c.waypoints.length - 1], at(after, c.targetId)), `${id}: ${c.id} ends on ${c.targetId}`).toBeLessThanOrEqual(3);
      }
    }
  });
});

describe("T4919 — the name floors are the diagram's own fonts, in the reducer and in the question the apply asks it", () => {
  const name = "Quality Assurance Compliance Review";
  const world = (laneFontSize: number, height: number): DiagramData => ({
    ...diagram([
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: height + 300, properties: { poolType: "white-box" } }),
      E({ id: "q", type: "lane", label: name, x: 36, y: 0, width: 864, height, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: height, width: 864, height: 300, parentId: "p", properties: {} }),
    ]),
    laneFontSize,
  });
  const floor = (fs: number) => laneMetrics(name, fs).minHeight;

  it("the three floors differ, so each case below means something", () => {
    expect(floor(10)).toBeLessThan(floor(14));
    expect(floor(14)).toBeLessThan(floor(20));
  });

  it("the reducer fits an empty lane to its name at the diagram's lane font", () => {
    expect(at(compress(world(20, 600), "q"), "q").height).toBe(floor(20));
    expect(at(compress(world(10, 600), "q"), "q").height).toBe(floor(10));
  });

  it("at its 20 px floor it is already fitted — never “compressed” with nothing changed", () => {
    const r = say(`compress the ${name} lane`, { d: world(20, floor(20)) });
    expect(r.ok).toBe(false);
    expect(r.summary).toBe(`${name} is already fitted to its content`);
  });

  it("at the 14 px floor on a 10 px diagram it still shrinks — never “already fitted”", () => {
    const r = say(`compress the ${name} lane`, { d: world(10, floor(14)) });
    expect(r.ok, r.summary).toBe(true);
    expect(at(r.after, "q").height).toBe(floor(10));
  });
});

/** A Crew lane with two sub-lanes (nested lanes, or stamped flush as the import lays them), and a step owned by Crew itself. */
function crewWorld(subType: "lane" | "sublane"): DiagramElement[] {
  const subX = subType === "lane" ? 72 : 36;
  return [
    E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 800, properties: { poolType: "white-box" } }),
    E({ id: "crew", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 500, parentId: "p", properties: {} }),
    E({ id: "north", type: subType, label: "Crew North", x: subX, y: 0, width: 900 - subX, height: 250, parentId: "crew", properties: {} }),
    E({ id: "south", type: subType, label: "Crew South", x: subX, y: 250, width: 900 - subX, height: 250, parentId: "crew", properties: {} }),
    E({ id: "desk", type: "lane", label: "Desk", x: 36, y: 500, width: 864, height: 300, parentId: "p", properties: {} }),
    E({ id: "n1", type: "task", label: "Plan Route", x: 200, y: 100, width: 100, height: 64, parentId: "north", properties: {} }),
    E({ id: "k", type: "task", label: "Pack Van", x: 400, y: 400, width: 100, height: 64, parentId: "crew", properties: {} }),
  ];
}

describe("T4920 — what a lane holds is what lies in it, before the fit moves it", () => {
  it("a step owned by a lane with NESTED sub-lanes, lying in one, slides with that one", () => {
    const d = diagram(crewWorld("lane"));
    const after = compress(d, "crew");
    const k = at(after, "k"), south = at(after, "south");
    expect(k.parentId, "owned by the sub-lane it lies in — never the lane below").toBe("south");
    expect(k.y, "½ Task under Crew South's top").toBe(south.y + 32);
    expect(k.y + k.height).toBeLessThanOrEqual(south.y + south.height);
    expect(at(after, "p").height, "nothing left sticking out of the pool").toBeGreaterThanOrEqual(k.y + k.height);
    expectTiled(after);
    expectContentInside(after);
    expect(checkEffect({ op: "compressLane", laneRef: "Crew" }, d, after, { laneRef: "crew" })!.ok).toBe(true);
  });

  it("the same with STAMPED sub-lanes: the step is lent to the one it lies in, and handed back", () => {
    const d = diagram(crewWorld("sublane"));
    const after = compress(d, "crew");
    const k = at(after, "k"), south = at(after, "south");
    expect(k.parentId, "still Crew's — the fit only lent it").toBe("crew");
    expect(k.y).toBe(south.y + 32);
    expect(k.y + k.height).toBeLessThanOrEqual(south.y + south.height);
    expect([at(after, "south").x, at(after, "south").width], "a stamped sub-lane keeps its place across the lane").toEqual([36, 864]);
    expectTiled(after);
    expectContentInside(after);
    // L4 reads what Crew South SHOWS, the step Crew owns included — not only its own children.
    expect(checkEffect({ op: "compressLane", laneRef: "Crew" }, d, after, { laneRef: "crew" })).toEqual({ ok: true, detail: "" });
  });

  it("a step left owned by the POOL, lying in a lane, is that lane's before the fit — never the lane below's", () => {
    const els = [
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 800, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 400, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "Load", x: 200, y: 300, width: 100, height: 64, parentId: "p", properties: {} }),
    ];
    const after = compress(diagram(els), "a");
    const t = at(after, "t"), a = at(after, "a");
    expect(t.parentId).toBe("a");
    expect(t.y).toBe(32);
    expect(t.y + t.height).toBeLessThanOrEqual(a.y + a.height);
  });

  it("a lane already fitted is left exactly as it was, stale ownership and all — “already fitted” is the truth", () => {
    const els = [
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 528, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 128, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 128, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "t", type: "task", label: "Load", x: 200, y: 32, width: 100, height: 64, parentId: "p", properties: {} }),
    ];
    const d = diagram(els);
    expect(compress(d, "a")).toBe(d);
  });
});

describe("T4921 — the lane words are containerWords.ts's, mis-hears and the recogniser's full stops included", () => {
  it("“line”, the lane mis-heard, holds like “lane” — compress and expand alike", () => {
    for (const said of ["Expand line.", "expand the line", "Compress line.", "compress the line", "expand sub line", "Compress the poll."]) {
      expect(isIncompleteCommand(said), said).toBe(true);
    }
    for (const said of ["compress the lanes", "expand the lines", "expand the pool"]) {
      expect(isIncompleteCommand(said), said).toBe(false);
    }
  });

  it("every expand verb, with its forms", () => {
    expect(parseCommand("grows the Sales lane")).toEqual([{ op: "expandLane", laneRef: "lane Sales" }]);
    expect(parseCommand("expanded lane Sales by 40 px")).toEqual([{ op: "expandLane", laneRef: "lane Sales", distance: 40 }]);
    expect(parseCommand("enlarge the pools")).toEqual([{ op: "extendPools" }]);
  });

  it("a held kind word followed by the recogniser's full stop keeps its kind — never the pool of that name", () => {
    expect(parseCommand("Compress lane. Customer.")).toEqual([{ op: "compressLane", laneRef: "lane Customer" }]);
    expect(parseCommand("Expand lane. Underwriters.")).toEqual([{ op: "expandLane", laneRef: "lane Underwriters" }]);
    const r = say("Compress lane. Customer.");
    expect(r.ok).toBe(false);
    expect(at(r.after, "cust"), "the Customer POOL is not touched").toEqual(at(fixtureDiagram(), "cust"));
  });
});

describe("T4922 — the cases the review's mutations showed were unguarded", () => {
  it("a lane whose own name needs more than its fitted sub-lanes keeps that height, in its last sub-lane", () => {
    const long = "Claims Team And Everybody Who Works In It Every Day";
    const renamed = reducer(fixtureDiagram(), { type: "UPDATE_LABEL", payload: { id: "L1", label: long } });
    const after = compress(renamed, "L1");
    expect(at(after, "L1").height).toBe(laneMetrics(long, 14).minHeight);
    expect(at(after, "S1").height, "Sub 1 is fitted").toBe(122);
    expectTiled(after);
    expect(compress(after, "L1"), "and a second compress changes nothing").toBe(after);
  });

  it("“compress sublane” with only a top-level lane selected asks — a lane is not a sub-lane", () => {
    const r = say("compress sublane", { selected: ["L2"] });
    expect(r.h.screen).toContain("pick");
    expect(r.summary).toMatch(/which “sublane”\? say a number \(1–2\)/);
  });

  it("“expand this lane” with a task selected is refused, and nothing grows", () => {
    const r = say("expand this lane", { selected: ["t4"] });
    expect(r.ok).toBe(false);
    expect(r.summary).toBe("Task 1 isn't a lane");
    expect(r.after.elements).toEqual(headlessDiagram(fixtureDiagram()).data.elements);
  });

  it("L4: an empty lane left taller than its name fails", () => {
    const d = diagram([
      E({ id: "p", type: "pool", label: "Ops", x: 0, y: 0, width: 900, height: 700, properties: { poolType: "white-box" } }),
      E({ id: "a", type: "lane", label: "Crew", x: 36, y: 0, width: 864, height: 400, parentId: "p", properties: {} }),
      E({ id: "b", type: "lane", label: "Desk", x: 36, y: 400, width: 864, height: 300, parentId: "p", properties: {} }),
    ]);
    expect(checkEffect({ op: "compressLane", laneRef: "Crew" }, d, d, { laneRef: "a" })!.detail).toMatch(/Crew holds nothing and is taller than its name needs/);
  });

  it("expand: a pool further below than 100 px plus the growth is not pushed", () => {
    const d = fixtureDiagram();
    d.elements = d.elements.map((e) => (["cust", "sys", "pool3"].includes(e.id) ? { ...e, y: e.y + 300 } : e));
    const after = expand(d, "L2", 64);
    for (const id of ["cust", "sys", "pool3"]) expect(at(after, id).y, id).toBe(at(d, id).y);
  });

  it("a stamped sub-lane laid flush by the import keeps its place across the lane through a divider drag", () => {
    const flush = stampedWorld().map((e) => (e.type === "sublane" ? { ...e, x: 36, width: 864 } : e));
    const after = reducer(diagram(flush), { type: "MOVE_LANE_BOUNDARY", payload: { aboveLaneId: "A", belowLaneId: "B", dy: 50 } });
    for (const id of ["A1", "A2"]) expect([at(after, id).x, at(after, id).width], id).toEqual([36, 864]);
    expect(at(after, "A2").height).toBe(250);
    expectTiled(after);
  });
});
