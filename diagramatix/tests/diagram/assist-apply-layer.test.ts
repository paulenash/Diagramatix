/**
 * T4748–T4753 — L4: did applying the ops do the right thing?
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
import { generateCases } from "@/app/lib/assist/commandGenerator";
import { scoreCase, summarise } from "@/app/lib/assist/commandScore";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { checkEffect, checkAlign } from "@/app/lib/assist/opEffects";
import { fixtureElements, fixtureDiagram, fixtureConnectors } from "@/app/lib/assist/commandFixture";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import type { DiagramData } from "@/app/lib/diagram/types";

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
    const ed = src("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    expect(ed).toContain(`from "@/app/lib/assist/applyAssistOps"`);
    expect(ed).toContain("return applyAssistOpsTo(ops, {");
    // A branch left behind in the editor would be a second copy, and the
    // harness would score the one the user never runs.
    for (const branch of [`op.op === "addLaneAt"`, `op.op === "wrapInPool"`, `op.op === "rename"`, `op.op === "movePoolBoundary"`]) {
      expect(ed, `${branch} must live in applyAssistOps.ts only`).not.toContain(`if (${branch})`);
    }
  });

  it("the editor keeps only what is editor memory: \"again\" and the display snapshots", () => {
    const ed = src("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    const body = ed.slice(ed.indexOf("const applyAssistOps = useCallback("), ed.indexOf("return applyAssistOpsTo(ops, {"));
    expect(body).toContain("lastAbraOpsRef.current");
    expect(body).toContain("armGoldFlash(data.elements)");
    expect(body).toContain("debugBeforeRef.current =");
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
    "wrapInPool|no pool is called “…”":
      "With a pool already on the diagram, WRAP_IN_POOL grows the biggest pool to adopt the loose elements and DROPS the name. T4738 made the grammar keep “called X”; the reducer still has nowhere to put it. Needs a decision: rename the grown pool, or draw a new one.",
    "addLaneAt|the new lane is not above Underwriters":
      "REDUCER BUG. When the named lane has no room at the edge asked for, the carve borrows from ANOTHER lane and the new lane lands at the bottom of the pool, reported as “added a lane above Underwriters”. Same code as the mouse lane-drop (carveBandWithin), so not changed without Paul.",
    "addLaneAt|the new lane is not above Claims Team":
      "The same carve fallback as above.",
    "addLaneAt|refused: no room below Claims Team for a lane called “…” — it is carved out of Claims Team and the pool does not grow; make Claims Team taller or use a shorter name":
      "A lane whose sublanes fill it cannot give up room, so nothing can be carved beside it. Was a silent no-op reported as success until 2026-09-25; now it says so.",
    "addLaneAt|refused: no room above Lane 3 for a lane called “…” — it is carved out of Lane 3 and the pool does not grow; make Lane 3 taller or use a shorter name":
      "A CORRECT refusal: Pay Claim sits at the top of Lane 3, so there is no room above it. Listed so the case stays visible rather than being generated away.",
    "moveLane|refused: Underwriters can't move up — Claims Team has no room to give":
      "MOVE_LANE counts Claims Team's sublanes as contents that reach its bottom, so it can never shrink. Was reported as “moved” until 2026-09-25. A lane with sublanes could give room from its last sublane, as a pool resize does — Paul's call.",
  };

  const CORPUS = { seed: DEFAULT_CORPUS_SEED, count: 600 };
  const MAX_WRONG_EDITS = 70;
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
  const before = fixtureDiagram();
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
  it("“add a lane” with no room is refused, by name, not reported as added", () => {
    const r = say("add a lane below Claims Team called Quality Assurance");
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/no room below Claims Team for a lane called “Quality Assurance”/);
    expect(r.after.elements.filter((e) => e.type === "lane")).toHaveLength(5);
  });

  it("an edge lane says WHY it cannot move, rather than blaming its neighbour", () => {
    // Needs a lane on both sides: moving down grows the one above.
    const top = say("move the Claims Team lane down");
    expect(top.ok).toBe(false);
    expect(top.summary).toMatch(/Claims Team is the top lane/);
  });

  it("and a move that CAN happen still does, and says so", () => {
    const r = say("move the Underwriters lane down");
    expect(r.ok, r.summary).toBe(true);
    const was = fixtureDiagram().elements.find((e) => e.id === "L2")!.y;
    expect(r.after.elements.find((e) => e.id === "L2")!.y).toBeGreaterThan(was);
  });

  it("the room rule is the REDUCER's, asked — not copied into the apply layer", () => {
    const body = src("app", "lib", "assist", "applyAssistOps.ts");
    expect(body).toContain("return reducer(now, action) !== now;");
    expect(body).toContain(`wouldChange({ type: "ADD_LANE_AT"`);
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

  it("a lane moves only if it has a lane on both sides", () => {
    for (const c of cases().filter((x) => x.family === "moveLane")) expect(Object.values(c.refs), c.utterance).toEqual(["L2"]);
  });

  it("nothing is added AFTER a start event's flow — nothing flows into one", () => {
    for (const c of cases().filter((x) => x.family === "add")) {
      const op = c.ops[0] as { symbolType?: string; afterRef?: string };
      if (op.symbolType === "start-event") expect(op.afterRef, c.utterance).toBeUndefined();
    }
  });

  it("the fixture holds nothing the reducer would correct on contact", () => {
    // Black-box pools below the 116px minimum GREW on their first edit and
    // made a boundary move read as the wrong way.
    for (const p of fixtureElements().filter((e) => e.type === "pool")) expect(p.height, p.label).toBeGreaterThanOrEqual(116);
    // And one loose element, so a wrap has something to wrap.
    expect(fixtureElements().some((e) => e.type !== "pool" && !e.parentId)).toBe(true);
  });
});
