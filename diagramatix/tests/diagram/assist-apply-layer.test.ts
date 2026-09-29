/**
 * T4748–T4753, T4757–T4759, T4832, T4838 — L4: did applying the ops do the right thing?
 *
 * Paul, 2026-09-25, of the harness's last open layer: "The harness doesn't yet
 * check whether the diagram itself came out right." It could not, because the
 * code that applies the ops lived inside the 8,700-line editor component. It
 * now lives in app/lib/assist/applyAssistOps.ts; the editor delegates to it,
 * and `headlessDiagram` runs it against the real reducer with no React.
 *
 * On its first run it found three commands that told the user they had worked
 * and changed nothing, a lane added at the wrong end of the pool, and a named
 * pool whose name went nowhere. See T4750 for the list.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateCases, NOT_GENERATED, NOT_ON_TEST_DIAGRAM } from "@/app/lib/assist/commandGenerator";
import { scoreCase, summarise } from "@/app/lib/assist/commandScore";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { checkEffect, checkAlign } from "@/app/lib/assist/opEffects";
import { fixtureElements, fixtureDiagram, fixtureConnectors, LANE_LABELS, FIXTURE_IDS, spokenName } from "@/app/lib/assist/commandFixture";
import { fixtureDiagram as fixtureDiagramV1 } from "./_helpers/voiceFixtureV1";
import { reducer, connectorLabelPayload, healOnLoad } from "@/app/hooks/useDiagram";
import { poolMetrics } from "@/app/lib/diagram/containerMetrics";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import type { DiagramData } from "@/app/lib/diagram/types";
import { editorSource } from "./assistApplySource";

const src = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

/** Say it, apply it headless, and hand back what the log said and what came out. */
function say(sentence: string, opts: { selected?: string[]; diagram?: DiagramData } = {}) {
  const h = headlessDiagram(opts.diagram ?? fixtureDiagram());
  const ops = parseCommand(sentence);
  expect(ops, `the grammar must parse “${sentence}”`).toBeTruthy();
  const r = applyAssistOps(ops!, h.context({ selectedIds: opts.selected }));
  return { ...r, after: h.data, ops: ops! };
}

describe("T4748 — the editor delegates; the ops are applied in ONE place", () => {
  it("DiagramEditor calls the module and no longer carries the op branches", () => {
    const ed = editorSource();
    expect(ed).toContain(`from "@/app/lib/assist/applyAssistOps"`);
    expect(ed).toContain("return applyAssistOpsTo(ops, {");
    // A branch left behind in the editor would be a second copy, and the
    // harness would score the one the user never runs.
    for (const branch of [`op.op === "addLaneAt"`, `op.op === "wrapInPool"`, `op.op === "rename"`, `op.op === "movePoolBoundary"`]) {
      expect(ed, `${branch} must live in applyAssistOps.ts only`).not.toContain(`if (${branch})`);
    }
  });

  it("the editor keeps only what is editor memory: \"again\" and the display snapshots", () => {
    const ed = editorSource();
    const body = ed.slice(ed.indexOf("const applyAssistOps = useCallback("), ed.indexOf("return applyAssistOpsTo(ops, {"));
    expect(body).toContain("lastAbraOpsRef.current");
    expect(body).toContain("armGoldFlash(data.elements)");
    // The debug snapshot is armed by one helper, shared with the template
    // window's picks, which change the diagram too.
    expect(body).toContain("armDebugBefore(data.elements)");
    const arm = ed.slice(ed.indexOf("const armDebugBefore = useCallback("), ed.indexOf("}, [voiceDebugRecording]);"));
    expect(arm).toContain("debugBeforeRef.current =");
  });
});

describe("T4749 — the headless diagram dispatches what useDiagram dispatches", () => {
  /** name → action type, read from `const NAME = useCallback(… dispatch({ type: "X"`. */
  const hookTypes = (): Record<string, string[]> => {
    const hook = src("app", "hooks", "useDiagram.ts");
    const out: Record<string, string[]> = {};
    const re = /\n  const (\w+) = useCallback\(/g;
    const starts = [...hook.matchAll(re)];
    starts.forEach((m, i) => {
      const body = hook.slice(m.index!, starts[i + 1]?.index ?? hook.length);
      out[m[1]] = [...body.matchAll(/dispatch\(\{\s*type: "(\w+)"/g)].map((x) => x[1]);
    });
    return out;
  };
  const headlessTypes = (): Record<string, string[]> => {
    const h = src("app", "lib", "assist", "headlessDiagram.ts");
    const block = h.slice(h.indexOf("const actions: AssistDiagramActions = {"), h.indexOf("const ui: AssistUi = {"));
    const out: Record<string, string[]> = {};
    const re = /\n    (\w+): /g;
    const starts = [...block.matchAll(re)];
    starts.forEach((m, i) => {
      const body = block.slice(m.index!, starts[i + 1]?.index ?? block.length);
      out[m[1]] = [...body.matchAll(/type: "(\w+)"/g)].map((x) => x[1]);
    });
    return out;
  };

  it("every action, by name, sends the same reducer action type", () => {
    // Payload SHAPES are held by the compiler (the reducer's Action union).
    // The TYPE per name is not — a headless `wrapInPool` that dispatched
    // WRAP_IN_CONTAINER would type-check and score a different product.
    const hook = hookTypes(), head = headlessTypes();
    expect(Object.keys(head).length).toBeGreaterThanOrEqual(30);
    for (const [name, types] of Object.entries(head)) {
      const want = name === "addElementGated" ? hook.addElement : hook[name];
      expect(want, `useDiagram has no ${name}`).toBeDefined();
      // undo/clear go through SET_DATA; the move/resize pairs through their own.
      expect(types, name).toEqual(want);
    }
  });

  it("T4832 — and the same PAYLOAD for updateConnectorLabel: one builder, used by both", () => {
    // The compiler held the payload's shape, not its keys: the editor sent the
    // position fields as undefined, this file left them out, and the reducer's
    // spread erased the position for the editor alone — so the harness kept a
    // label the editor dropped into the pool (Paul's "Request", 2026-09-25).
    const hook = src("app", "hooks", "useDiagram.ts");
    const helper = hook.slice(hook.indexOf("const updateConnectorLabel = useCallback("), hook.indexOf("const elementMoveEnd = useCallback("));
    expect(helper).toContain("payload: connectorLabelPayload(id, label, labelOffsetX, labelOffsetY, labelWidth)");
    expect(src("app", "lib", "assist", "headlessDiagram.ts")).toContain("payload: connectorLabelPayload(id, label)");
    // What the editor's two-argument call sends is exactly what the harness sends.
    expect(connectorLabelPayload("c", "Request", undefined, undefined, undefined)).toEqual(connectorLabelPayload("c", "Request"));
    expect(Object.keys(connectorLabelPayload("c", "Request", undefined, undefined, undefined))).toEqual(["id", "label"]);
    // And the diagrams they produce are the same, the stored position kept by both.
    const d0 = fixtureDiagram();
    const d: DiagramData = { ...d0, connectors: d0.connectors.map((c, i) =>
      (i === 0 ? { ...c, label: "old", labelOffsetX: 12, labelOffsetY: -20, labelWidth: 80 } : c)) };
    const id = d.connectors[0].id;
    const h = headlessDiagram(d);
    h.actions.updateConnectorLabel(id, "Renamed");
    const viaHook = reducer(d, { type: "UPDATE_CONNECTOR_LABEL", payload: connectorLabelPayload(id, "Renamed", undefined, undefined, undefined) });
    expect(h.data.connectors).toEqual(viaHook.connectors);
    const c = viaHook.connectors[0];
    expect([c.label, c.labelOffsetX, c.labelOffsetY, c.labelWidth]).toEqual(["Renamed", 12, -20, 80]);
  });

  it("T4838 — and it opens the diagram the way the editor does: the same load heal", () => {
    // The editor heals a diagram as it opens it (useReducer's initialiser); a
    // headless diagram that did not would score a diagram no one sees — Paul's
    // saved "Request", with no position, drawn inside My company.
    const hook = src("app", "hooks", "useDiagram.ts");
    expect(hook).toContain("useReducer(reducer, initialData, healOnLoad)");
    expect(src("app", "lib", "assist", "headlessDiagram.ts")).toContain("let state = healOnLoad(initial);");
    const saved = JSON.parse(src("tests", "fixtures", "block2-test3-add-message.json")) as DiagramData;
    expect(saved.connectors.find((x) => x.id === "bqdjxqwf")!.labelOffsetX).toBeUndefined();
    const h = headlessDiagram(saved);
    expect(h.data).toEqual(healOnLoad(saved));
    expect(h.data.connectors.find((x) => x.id === "bqdjxqwf")!.labelOffsetX).toBeTypeOf("number");
    // L4 judges a command against the diagram as opened, so the heal is never
    // mistaken for the command's effect.
    const score = src("app", "lib", "assist", "applyScore.ts");
    expect(score).toContain("const before = structuredClone(h.data);");
  });

  it("a staged move is ONE undo entry, committed at its end, as in the editor", () => {
    const h = headlessDiagram(fixtureDiagram());
    const y0 = h.data.elements.find((e) => e.id === "t4")!.y;
    h.actions.moveElements(["t4"], 0, 10);
    h.actions.moveElements(["t4"], 0, 10);
    h.actions.elementsMoveEnd();
    expect(h.data.elements.find((e) => e.id === "t4")!.y).toBe(y0 + 20);
    h.actions.undo();
    expect(h.data.elements.find((e) => e.id === "t4")!.y, "one undo takes back the whole move").toBe(y0);
  });
});

describe("T4750 — L4 over the corpus, with its wrong edits frozen", () => {
  /**
   * Where the ops were right and the DIAGRAM came out wrong, keyed by family
   * and the check's finding (names in quotes folded away).
   *
   * The same ratchet as T4727, failing both ways: a new kind fails, and a
   * listed one that starts passing fails too, so the list cannot go stale.
   * Each line is a finding for Paul, not a defect being tolerated.
   */
  const KNOWN_WRONG_EDITS: Record<string, string> = {
    // Empty, and that is the ratchet working.
    //
    // Its first run (2026-09-25) froze six: a named wrap that dropped the name,
    // a lane "above Underwriters" carved at the far end of the pool, and lanes
    // beside sublane-filled neighbours that could not move or be carved. Paul
    // decided each the same day — grow and SAY the name was not used; refuse a
    // carve that would land anywhere but where it was named (voice only, the
    // mouse drop keeps its fallback); keep refusing beside sublanes — and the
    // corpus now asks only for what the fixture has room for.
    //
    // Re-run on Paul's own test diagram (2026-09-27): 59 wrong edits on the
    // first pass, every one the HARNESS asking for what his diagram cannot do —
    // an align selection naming a task it does not have, a whole-diagram wrap
    // with nothing outside a pool, lanes carved where no name fits, a lane
    // already fitted asked to compress. Each correctly refused; the generator
    // now asks only what the diagram can do (T4932, T4933), and it is empty again.
  };
  const CORPUS = { seed: DEFAULT_CORPUS_SEED, count: 600 };
  const MAX_WRONG_EDITS = 0;
  const fold = (d: string) => d.replace(/“[^”]*”/g, "“…”");

  const run = () => {
    const els = fixtureElements();
    return generateCases({ ...CORPUS, world: els }).map((c) => scoreCase(c, undefined, els, { diagram: fixtureDiagram() }));
  };
  const kindsOf = (rs: ReturnType<typeof run>) =>
    new Set(rs.filter((r) => r.outcome === "wrong-edit").map((r) => `${r.family}|${fold(r.detail)}`));

  it("nothing comes out wrong except what is written down", () => {
    const surprises = [...kindsOf(run())].filter((k) => !(k in KNOWN_WRONG_EDITS));
    expect(surprises, "new wrong edit(s) — fix the apply layer or the reducer, or write down why").toEqual([]);
  });

  it("and everything written down is still wrong", () => {
    const kinds = kindsOf(run());
    const fixed = Object.keys(KNOWN_WRONG_EDITS).filter((k) => !kinds.has(k));
    expect(fixed, "these come out right now — delete them from KNOWN_WRONG_EDITS").toEqual([]);
  });

  it("the count stays under its ceiling, and L4 does not starve L1–L3", () => {
    const rs = run();
    const wrong = rs.filter((r) => r.outcome === "wrong-edit").length;
    expect(wrong, `${wrong} wrong edits`).toBeLessThanOrEqual(MAX_WRONG_EDITS);
    // L4 runs only after L3 passed: the other layers' counts are unchanged by it.
    const without = summarise(generateCases({ ...CORPUS, world: fixtureElements() }).map((c) => scoreCase(c, undefined, fixtureElements())));
    expect(summarise(rs).failed - wrong).toBe(without.failed);
  });
});

describe("T4751 — the checks catch a wrong edit, and never pass one by staying silent", () => {
  // The frozen first test diagram: these pin the CHECKS on its ids and numbers (t2 at y 30, the gateway "Decision?").
  const before = fixtureDiagramV1();
  const renamed = (label: string): DiagramData => ({ ...before, elements: before.elements.map((e) => (e.id === "t4" ? { ...e, label } : e)) });

  it("a rename is checked against the NEW name, not just 'something changed'", () => {
    expect(checkEffect({ op: "rename", ref: "Task 1", label: "Review Email" }, before, renamed("Review Email"), { ref: "t4" })!.ok).toBe(true);
    expect(checkEffect({ op: "rename", ref: "Task 1", label: "Review Email" }, before, renamed("Review E-mail"), { ref: "t4" })!.ok).toBe(false);
  });

  it("a gateway's added question mark is the reducer being right, not a wrong name", () => {
    const g = { ...before, elements: before.elements.map((e) => (e.id === "g2" ? { ...e, label: "Update Policy?" } : e)) };
    expect(checkEffect({ op: "rename", ref: "Decision?", label: "Update Policy" }, before, g, { ref: "g2" })!.ok).toBe(true);
  });

  it("display ops return null — 'nothing to check', never a pass", () => {
    for (const op of [{ op: "goldFlash", on: true }, { op: "export", format: "json" }, { op: "pickTemplate" }] as const) {
      expect(checkEffect(op as never, before, before, {})).toBeNull();
    }
  });

  it("align is checked on the selection's shared edge", () => {
    const aligned = { ...before, elements: before.elements.map((e) => (e.id === "t2" ? { ...e, y: 30 } : e)) };
    expect(checkAlign("top", ["t1", "t2"], aligned).ok).toBe(true);
    const off = { ...before, elements: before.elements.map((e) => (e.id === "t2" ? { ...e, y: 55 } : e)) };
    expect(checkAlign("top", ["t1", "t2"], off).ok).toBe(false);
  });
});

describe("T4752 — a command that changed nothing never says it worked", () => {
  // The frozen first test diagram: Claims Team, filled by its sub-lanes, is the lane with no room.
  const diagram = fixtureDiagramV1;

  it("“add a lane” with no room is refused, by name, not reported as added", () => {
    const r = say("add a lane below Claims Team called Quality Assurance", { diagram: diagram() });
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/no room below Claims Team for a lane called “Quality Assurance”/);
    expect(r.after.elements.filter((e) => e.type === "lane")).toHaveLength(5);
  });

  it("an edge lane says WHY it cannot move, rather than blaming its neighbour", () => {
    // Needs a lane on both sides: moving down grows the one above.
    const top = say("move the Claims Team lane down", { diagram: diagram() });
    expect(top.ok).toBe(false);
    expect(top.summary).toMatch(/Claims Team is the top lane/);
  });

  it("and a move that CAN happen still does, and says so", () => {
    const r = say("move the Underwriters lane down", { diagram: diagram() });
    expect(r.ok, r.summary).toBe(true);
    const was = diagram().elements.find((e) => e.id === "L2")!.y;
    expect(r.after.elements.find((e) => e.id === "L2")!.y).toBeGreaterThan(was);
  });

  it("the room rule is the REDUCER's, asked — not copied into the apply layer", () => {
    const body = src("app", "lib", "assist", "applyAssistOps.ts");
    expect(body).toContain("const next = reducer(now, action);");
    expect(body).toContain("return next === now ? null : next;");
    expect(body).toContain(`preview({ type: "ADD_LANE_AT"`);
    expect(body).toContain(`wouldChange({ type: "MOVE_LANE"`);
  });
});

describe("T4753 — the corpus asks for things the fixture can do", () => {
  const cases = () => generateCases({ seed: DEFAULT_CORPUS_SEED, count: 600, world: fixtureElements() });

  it("disconnect names only pairs a flow already joins", () => {
    const joined = new Set(fixtureConnectors().flatMap((c) => [`${c.sourceId}>${c.targetId}`, `${c.targetId}>${c.sourceId}`]));
    const ds = cases().filter((c) => c.family === "disconnect");
    expect(ds.length).toBeGreaterThan(0);
    for (const c of ds) expect(joined.has(Object.values(c.refs).join(">")), c.utterance).toBe(true);
  });

  it("a lane moves only if it has a lane on both sides, and never toward one its sublanes fill", () => {
    // Changed 2026-09-27: on Paul's diagram no lane has sublanes, so
    // Underwriters — the one lane with a lane on both sides — moves BOTH ways;
    // the first diagram's Claims Team, filled by its sublanes, kept it to "down".
    const els = fixtureElements();
    const stack = els.filter((e) => e.type === "lane" && e.parentId === "p").sort((a, b) => a.y - b.y);
    const moves = cases().filter((x) => x.family === "moveLane");
    expect(moves.length).toBeGreaterThan(0);
    for (const c of moves) {
      expect(Object.values(c.refs), c.utterance).toEqual(["L2"]);
      const dir = (c.ops[0] as { direction: string }).direction;
      const i = stack.findIndex((l) => l.id === "L2");
      const shrinks = stack[dir === "up" ? i - 1 : i + 1];
      expect(els.some((e) => e.type === "lane" && e.parentId === shrinks.id), `${c.utterance} shrinks a lane its sublanes fill`).toBe(false);
    }
    expect(new Set(moves.map((c) => (c.ops[0] as { direction: string }).direction))).toEqual(new Set(["up", "down"]));
  });

  it("a lane is carved only beside a lane with room — at the edge the fixture declares has it", () => {
    // Changed 2026-09-27: room is DECLARED (FIXTURE_IDS.laneRoom) and proved
    // by asking the reducer (T4757) — on Paul's diagram, Lane 3 above and below.
    const room = new Set(FIXTURE_IDS.laneRoom.map(([id, where]) => `${id} ${where}`));
    const adds = cases().filter((x) => x.family === "addLaneAt");
    expect(adds.length).toBeGreaterThan(0);
    for (const c of adds) {
      expect(room.has(`${Object.values(c.refs)[0]} ${(c.ops[0] as { position: string }).position}`), c.utterance).toBe(true);
    }
  });

  it("nothing is added AFTER a start event's flow — nothing flows into one", () => {
    for (const c of cases().filter((x) => x.family === "add")) {
      const op = c.ops[0] as { symbolType?: string; afterRef?: string };
      if (op.symbolType === "start-event") expect(op.afterRef, c.utterance).toBeUndefined();
    }
  });

  it("the fixture holds nothing the reducer would correct on contact", () => {
    // Black-box pools below their name's minimum GREW on their first edit and
    // made a boundary move read as the wrong way. Changed 2026-09-27: the floor
    // is each pool's OWN name (the 116 was Salesforce's), and opening the
    // diagram — the editor's load heal — must change nothing at all.
    const d = fixtureDiagram();
    for (const p of d.elements.filter((e) => e.type === "pool")) {
      expect(p.height, spokenName(p.label)).toBeGreaterThanOrEqual(poolMetrics(p.label ?? "", d.poolFontSize ?? 16).minHeight);
    }
    const opened = headlessDiagram(fixtureDiagram()).data;
    expect(opened.elements, "the load heal moves nothing").toEqual(d.elements);
    expect(opened.connectors, "nor re-routes anything").toEqual(d.connectors);
    // No element outside a pool, so a whole-diagram wrap has nothing to wrap —
    // written down, and the family not generated (T4932).
    expect(fixtureElements().some((e) => e.type !== "pool" && !e.parentId)).toBe(false);
    expect(NOT_ON_TEST_DIAGRAM.loose).toBeTruthy();
    expect(NOT_GENERATED.wrapInPool).toMatch(/test diagram/);
  });
});

describe("T4757 — the fixture has room for every lane name the corpus can say", () => {
  it("each LANE_LABELS name is added at every edge FIXTURE_IDS.laneRoom declares, and no undeclared edge fits them all", () => {
    // A new lane must be tall enough for its name, which runs up its header.
    // Without the room the carve goes elsewhere and voice refuses — correctly —
    // and a correct refusal of an impossible case is noise in the corpus.
    // Changed 2026-09-27: Paul's diagram gives only Lane 3 room for every name
    // (Underwriters fits the short ones, Lane 2 none), so the room is DECLARED
    // and the generator carves only there — and this asks the reducer, through
    // the voice apply, rather than re-deriving its room rule from geometry.
    const lanes = fixtureElements().filter((e) => e.type === "lane");
    for (const lane of lanes) {
      for (const where of ["above", "below"] as const) {
        const declared = FIXTURE_IDS.laneRoom.some(([id, w]) => id === lane.id && w === where);
        const refused = LANE_LABELS.filter((name) => !say(`add a lane ${where} ${spokenName(lane.label)} called ${name}`).ok);
        if (declared) expect(refused, `${where} ${spokenName(lane.label)} is declared to have room`).toEqual([]);
        else expect(refused.length, `${where} ${spokenName(lane.label)} fits every name — declare it in FIXTURE_IDS.laneRoom`).toBeGreaterThan(0);
      }
    }
    expect(FIXTURE_IDS.laneRoom.length, "some lane has room, or addLaneAt is never said").toBeGreaterThan(0);
  });
});

describe("T4758 — voice puts a lane where it was named, or nowhere", () => {
  // The frozen first test diagram: its Underwriters had 190 px free above its row.
  /** Underwriters with its tasks hard against its top edge: no room above it, plenty at the pool's bottom. */
  const packedAbove = (): DiagramData => {
    const d = fixtureDiagramV1();
    return { ...d, elements: d.elements.map((e) => (e.parentId === "L2" ? { ...e, y: 318 } : e)) };
  };

  it("refuses rather than carving at the far end of the pool", () => {
    const r = say("add a lane above Underwriters called Billing Team", { diagram: packedAbove() });
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/no room above Underwriters for a lane called “Billing Team”/);
    expect(r.after.elements.some((e) => e.label === "Billing Team")).toBe(false);
  });

  it("while the MOUSE drop's fallback is untouched — the reducer still carves at the far end", () => {
    // Paul, 2026-09-25: refuse by voice only. A drop shows where the lane will
    // land before you let go; a sentence cannot.
    const d = packedAbove();
    const next = reducer(d, { type: "ADD_LANE_AT", payload: { poolId: "p", position: "above", refLaneId: "L2", label: "Billing Team" } } as never);
    const lane = next.elements.find((e) => e.label === "Billing Team");
    expect(lane, "the reducer still places it").toBeDefined();
    expect(lane!.y).toBeGreaterThan(next.elements.find((e) => e.id === "L2")!.y);
  });

  it("and a lane with room at the named edge is added there, as before", () => {
    const r = say("add a lane above Underwriters called Billing Team", { diagram: fixtureDiagramV1() });
    expect(r.ok, r.summary).toBe(true);
    const lane = r.after.elements.find((e) => e.label === "Billing Team")!;
    expect(lane.y + lane.height).toBe(r.after.elements.find((e) => e.id === "L2")!.y);
  });
});

describe("T4759 — a named wrap into an existing pool grows it, and says the name was not used", () => {
  // The frozen first test diagram: its "Reminder Sent" lies outside every pool (Paul's diagram has nothing loose).

  it("the pool keeps its own name, and the log names the one that was dropped", () => {
    // Paul, 2026-09-25: "grow, ignore the name" — but a name the user SAID
    // must not vanish without a word.
    const r = say("put a pool around everything called Accounts Payable", { diagram: fixtureDiagramV1() });
    expect(r.ok, r.summary).toBe(true);
    expect(r.summary).toMatch(/grew Claims Processing to take in 1 loose element — “Accounts Payable” was not used; the pool keeps its name/);
    expect(r.after.elements.some((e) => e.type === "pool" && e.label === "Accounts Payable")).toBe(false);
    expect(r.after.elements.find((e) => e.id === "loose")!.parentId).toBeTruthy();
  });

  it("with NO pool yet, the new pool still takes the name", () => {
    const d = fixtureDiagramV1();
    const bare: DiagramData = { ...d, connectors: [], elements: [d.elements.find((e) => e.id === "loose")!] };
    const r = say("put a pool around everything called Accounts Payable", { diagram: bare });
    expect(r.after.elements.find((e) => e.type === "pool")?.label).toBe("Accounts Payable");
  });
});

describe("T4933 — the fixture's declarations name what is really on the test diagram", () => {
  it("every id FIXTURE_IDS names is on the diagram, as the kind it is filed under", () => {
    // align asked for a selection of "t1" and "t2" by ids of its own; Paul's
    // diagram has no t2, so every align was refused for want of a selection
    // (2026-09-27). The ids live in FIXTURE_IDS now, and are checked here.
    const els = fixtureElements();
    const at = (id: string) => els.find((e) => e.id === id);
    const poolType = (id: string) => (at(id)?.properties as Record<string, unknown> | undefined)?.poolType;
    for (const id of FIXTURE_IDS.pools) expect(at(id)?.type, id).toBe("pool");
    expect(poolType(FIXTURE_IDS.whiteBoxPool)).toBe("white-box");
    expect(poolType(FIXTURE_IDS.participantPool)).toBe("black-box");
    expect(poolType(FIXTURE_IDS.systemPool)).toBe("black-box");
    for (const id of FIXTURE_IDS.lanes) expect(at(id)?.type, id).toBe("lane");
    for (const id of FIXTURE_IDS.defaultNamed) expect(spokenName(at(id)?.label), id).toMatch(/^(?:task|subprocess|lane) \d+$/i);
    for (const id of FIXTURE_IDS.alignPair) expect(at(id)?.type, id).toBe("task");
    for (const [id] of FIXTURE_IDS.laneRoom) expect(at(id)?.type, id).toBe("lane");
    for (const id of FIXTURE_IDS.fittedLanes) expect(at(id)?.type, id).toBe("lane");
  });

  it("a lane declared fitted is one the reducer will not compress, and every other lane is compressible", () => {
    const d = fixtureDiagram();
    for (const id of FIXTURE_IDS.lanes) {
      const after = reducer(d, { type: "COMPRESS_LANE", payload: { laneId: id } });
      expect(after === d, `${id} ${after === d ? "is already fitted" : "compresses"}`).toBe((FIXTURE_IDS.fittedLanes as readonly string[]).includes(id));
    }
  });
});

describe("T4934 — a connector named by its label is that connector, in the delete as in the rename", () => {
  // Found by the Commands card on Paul's diagram (2026-09-27), the first test
  // diagram with labelled messages: "delete connector Rejection Notification"
  // deleted the END EVENT "Send Rejection Notification" — the delete never had
  // the rename's rule — and "remove message Payment Details" found nothing,
  // because the label was typed on two lines.
  const REJECTION = "85ehykjb", PAYMENT = "q3rwp4lx", END = "n6jhgOBCGw8pvIuvRqZvN";

  it("“delete connector Rejection Notification” deletes the message, and the end event stays", () => {
    const r = say("delete connector Rejection Notification");
    expect(r.ok, r.summary).toBe(true);
    expect(r.after.connectors.some((c) => c.id === REJECTION), "the message is gone").toBe(false);
    expect(r.after.elements.some((e) => e.id === END), "the end event is not").toBe(true);
    expect(r.after.elements).toHaveLength(fixtureElements().length);
  });

  it("a label typed on two lines is found as it is said — delete and rename alike", () => {
    const del = say("remove message Payment Details");
    expect(del.ok, del.summary).toBe(true);
    expect(del.after.connectors.some((c) => c.id === PAYMENT)).toBe(false);
    const ren = say("rename connector Payment Details to Send Invoice");
    expect(ren.ok, ren.summary).toBe(true);
    expect(ren.after.connectors.find((c) => c.id === PAYMENT)!.label).toBe("Send Invoice");
  });

  it("an element named EXACTLY what was said still wins over a connector of that name", () => {
    const d = fixtureDiagram();
    const named: DiagramData = { ...d, elements: d.elements.map((e) => (e.id === "t5" ? { ...e, label: "Payment Details" } : e)) };
    const r = say("delete Payment Details", { diagram: named });
    expect(r.ok, r.summary).toBe(true);
    expect(r.after.elements.some((e) => e.id === "t5"), "the task named that is deleted").toBe(false);
    expect(r.after.connectors.some((c) => c.id === PAYMENT), "the message named that stays").toBe(true);
  });

  it("both scorers resolve it as the app does — and L4 fails the delete that took the end event", () => {
    const c = { id: "x#1", family: "t", utterance: "delete connector Rejection Notification", ops: parseCommand("delete connector Rejection Notification")!, refs: {} };
    expect(scoreCase(c, undefined, fixtureElements(), { connectors: fixtureDiagram().connectors }).outcome, "L3").toBe("pass");
    expect(scoreCase(c, undefined, fixtureElements(), { diagram: fixtureDiagram() }).outcome, "L4").toBe("pass");
    const d = fixtureDiagram();
    const tookTheEvent: DiagramData = {
      ...d,
      elements: d.elements.filter((e) => e.id !== END),
      connectors: d.connectors.filter((x) => x.sourceId !== END && x.targetId !== END),
    };
    const verdict = checkEffect({ op: "delete", ref: "connector Rejection Notification" }, d, tookTheEvent, { ref: `connector:${REJECTION}` })!;
    expect(verdict.ok).toBe(false);
    expect(verdict.detail).toMatch(/Send\s+Rejection\s+Notification was deleted — the sentence named the connector “Rejection Notification”/);
  });

  it("wiring: one rule, in connectorRef.ts, read by the apply layer and both scorers", () => {
    const apply = src("app", "lib", "assist", "applyAssistOps.ts");
    // Changed 2026-09-27: every match, so several are a question (T4939).
    expect(apply).toContain("connectorsOverElement(data.connectors, op.ref,");
    expect(apply).toContain("connectorsOverElement(data.connectors, leftRef,");
    expect(apply, "no second copy of the label key").not.toContain("function messageLabelKey(");
    expect(src("app", "lib", "assist", "commandScore.ts")).toContain("connectorResolution(connectors, spoken, el)");
    expect(src("app", "lib", "assist", "applyScore.ts")).toContain("connectorResolution(d.connectors, v, el)");
  });
});
