/**
 * T4839–T4845 — "add template after <ref>": the words, the op, and what the
 * apply layer does with them.
 *
 * Paul, 2026-09-25 (Block 2 Test 3, "add template after selected" with the
 * merge gateway selected): "added a task called "Template". It should allow
 * user to select a template then place the selected template After the
 * selected gateway." The grammar only knew the bare "add template"; anything
 * longer reached the add rule, which found no type word in "template" and made
 * a TASK called Template after the gateway — and widened every pool for it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { validateOps, type AssistOp } from "@/app/lib/assist/ops";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { substituteRef, type PickFlow } from "@/app/lib/assist/disambiguate";
import { cardsOf, numberTemplates, parseTemplateAnswer } from "@/app/lib/assist/templatePick";
import { TEMPLATE_BEFORE_REFUSAL } from "@/app/lib/assist/templatePhrase";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const E = (o: Record<string, unknown>) => ({ properties: {}, label: "", ...o }) as unknown as DiagramElement;

/** Paul's diagram at the moment he said it: the voice-debug snapshot with the
 *  wrongly added "Template" task and its flow taken off again. */
const paulsDiagram = () =>
  JSON.parse(readFileSync("tests/fixtures/block2-test3-template.json", "utf8")) as DiagramData;
const MERGE_GATEWAY = "5njpff19";

/** A small white-box process: two elements called Review, an End, and a task in an expanded subprocess. */
const world = (): DiagramData => ({
  elements: [
    E({ id: "P", type: "pool", label: "Us", x: 0, y: 0, width: 1400, height: 400, properties: { poolType: "white-box" } }),
    E({ id: "L", type: "lane", label: "Lane 1", x: 36, y: 0, width: 1364, height: 400, parentId: "P" }),
    E({ id: "s", type: "start-event", label: "Start", x: 60, y: 60, width: 36, height: 36, parentId: "L" }),
    E({ id: "cs", type: "task", label: "Check Stock", x: 140, y: 46, width: 102, height: 64, parentId: "L" }),
    E({ id: "r1", type: "task", label: "Review", x: 300, y: 46, width: 102, height: 64, parentId: "L" }),
    E({ id: "r2", type: "task", label: "Review", x: 460, y: 46, width: 102, height: 64, parentId: "L" }),
    E({ id: "end", type: "end-event", label: "End", x: 620, y: 60, width: 36, height: 36, parentId: "L" }),
    E({ id: "ep", type: "subprocess-expanded", label: "Handle it", x: 140, y: 180, width: 360, height: 180, parentId: "L" }),
    E({ id: "in", type: "task", label: "Inside", x: 200, y: 240, width: 102, height: 64, parentId: "ep" }),
  ],
  connectors: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}) as DiagramData;

describe("T4839 — “add template after X” opens the window anchored; it never makes a task", () => {
  it("every way of saying it gives pickTemplate with the anchor", () => {
    const cases: Array<[string, string]> = [
      ["add template after selected", "selected"],
      ["Add template after selected.", "selected"],           // Paul's own words, as the recogniser punctuated them
      ["add a template after review", "review"],
      ["insert a template after it", "it"],
      ["add template following the gateway", "the gateway"],
      ["add the template after selected gateway", "selected gateway"],
      ["add a new template after review", "review"],          // "new" made a task "New template" (verdict-5)
      ["put a template behind Check Stock", "Check Stock"],
      ["add template next to the gateway", "the gateway"],
    ];
    for (const [said, ref] of cases) {
      expect(parseCommand(said), said).toEqual([{ op: "pickTemplate", afterRef: ref }]);
    }
  });

  it("“use a template after this” is a template, not the ghost pick it used to be", () => {
    expect(parseCommand("use a template after this")).toEqual([{ op: "pickTemplate", afterRef: "this" }]);
  });

  it("the sentence the fragment buffer stitches from a held “Add template,” is read too", () => {
    // "Add template," ends in a comma, so the hold keeps it; the next final is
    // joined with a space. Without the comma allowance this went to the AI.
    expect(isIncompleteCommand("Add template,")).toBe(true);
    const out = stitchFinals([
      { text: "Add template,", atMs: 0 },
      { text: "after selected.", atMs: 3000 },
    ], 6000);
    expect(out).toEqual(["Add template, after selected."]);
    expect(parseCommand(out[0])).toEqual([{ op: "pickTemplate", afterRef: "selected" }]);
  });

  it("the anchor words are the add rule's own list — one list", () => {
    // "following" / "behind" / "next to" / "onto" work for both, because both
    // read the same AFTER_WORDS.
    expect(parseCommand("add a task called Pack following Review")).toEqual([
      { op: "add", symbolType: "task", label: "Pack", afterRef: "Review" },
    ]);
    const grammar = readFileSync("app/lib/assist/commandGrammar.ts", "utf8");
    expect(grammar).toContain("new RegExp(`\\\\s+${AFTER_WORDS}\\\\s+(.+)$`, \"i\")");
    expect(grammar).not.toContain("(?:after|following|behind|next to|onto)");
  });
});

describe("T4840 — “before” is carried to be refused; “here” is the pointer", () => {
  it("before / ahead of / in front of / preceding give beforeRef, never an add", () => {
    // Before this, two of these made a GATEWAY named "template before the" /
    // "template ahead of the" — the add rule's type word came from the ref.
    expect(parseCommand("add template before the gateway")).toEqual([{ op: "pickTemplate", beforeRef: "the gateway" }]);
    expect(parseCommand("add a template ahead of the gateway")).toEqual([{ op: "pickTemplate", beforeRef: "the gateway" }]);
    expect(parseCommand("add template in front of Review")).toEqual([{ op: "pickTemplate", beforeRef: "Review" }]);
    expect(parseCommand("add a template preceding Review")).toEqual([{ op: "pickTemplate", beforeRef: "Review" }]);
  });

  it("here / there / right here — the mouse", () => {
    expect(parseCommand("add template here")).toEqual([{ op: "pickTemplate", at: "pointer" }]);
    expect(parseCommand("put a template over there")).toEqual([{ op: "pickTemplate", at: "pointer" }]);
    expect(parseCommand("add a template right here")).toEqual([{ op: "pickTemplate", at: "pointer" }]);
  });
});

describe("T4841 — the forms that name a task are untouched; the word “template” alone never becomes one", () => {
  it("the bare command and every naming form still mean what they meant", () => {
    expect(parseCommand("add template")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("templates")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("add a new template")).toEqual([{ op: "pickTemplate" }]);
    expect(parseCommand("add a template called Intake")).toEqual([{ op: "add", symbolType: "task", label: "Intake" }]);
    expect(parseCommand("add template called X after Review")).toEqual([{ op: "add", symbolType: "task", label: "X", afterRef: "Review" }]);
    expect(parseCommand("add a task called template")).toEqual([{ op: "add", symbolType: "task", label: "template" }]);
    // A name that merely BEGINS with Template is somebody's name (verdict-5).
    expect(parseCommand("add a task Template Review")).toEqual([{ op: "add", symbolType: "task", label: "Template Review" }]);
    expect(parseCommand("add template review")).toEqual([{ op: "add", symbolType: "task", label: "template review" }]);
  });

  it("a placement the template rule cannot read goes to the AI, never a task or gateway called “template …”", () => {
    for (const said of ["add a template to the selected", "add a template to the gateway", "add template after", "add template following", "add a template on Review"]) {
      const ops = parseCommand(said);
      const named = (ops ?? []).filter((o) => o.op === "add" && /^template/i.test((o as { label?: string }).label ?? ""));
      expect(named, said).toEqual([]);
      expect(ops, said).toBeNull();
    }
  });

  it("“add template after” cut off by a pause is held for the rest", () => {
    expect(isIncompleteCommand("add template after")).toBe(true);
    expect(isIncompleteCommand("add template before")).toBe(true);
    expect(isIncompleteCommand("add template following")).toBe(true);
    const out = stitchFinals([
      { text: "add template after", atMs: 0 },
      { text: "selected", atMs: 3000 },
    ], 6000);
    expect(out).toEqual(["add template after selected"]);
  });
});

describe("T4842 — the op carries the anchor, from the grammar and from the AI", () => {
  it("validateOps keeps afterRef, beforeRef and at, and drops everything else", () => {
    expect(validateOps([
      { op: "pickTemplate", afterRef: " Review ", junk: 1, label: "Template" },
      { op: "pickTemplate", beforeRef: "End" },
      { op: "pickTemplate", at: "pointer" },
      { op: "pickTemplate", at: "somewhere", afterRef: "" },
      { op: "pickTemplate" },
    ])).toEqual([
      { op: "pickTemplate", afterRef: "Review" },
      { op: "pickTemplate", beforeRef: "End" },
      { op: "pickTemplate", at: "pointer" },
      { op: "pickTemplate" },
      { op: "pickTemplate" },
    ]);
  });

  it("the AI is told the canonical form and the field", () => {
    const route = readFileSync("app/api/ai/command/route.ts", "utf8");
    expect(route).toContain("add template after <name>");
    expect(route).toContain(`{ "op":"pickTemplate", "afterRef"?: <name> }`);
  });
});

describe("T4843 — Paul's diagram: “add template after selected” opens the window and changes nothing", () => {
  it("no task called Template, no pool resized, the window anchored on the gateway", () => {
    const h = headlessDiagram(paulsDiagram());
    const before = h.data;
    const ops = parseCommand("Add template after selected.")!;
    const r = applyAssistOps(ops, h.context({ selectedIds: [MERGE_GATEWAY] }));
    expect(r.ok).toBe(true);
    expect(h.screen).toEqual([`template after ${MERGE_GATEWAY}`]);
    expect(h.data.elements).toBe(before.elements);
    expect(h.data.connectors).toBe(before.connectors);
    expect(h.data.elements.some((e) => /template/i.test(e.label ?? ""))).toBe(false);
  });
});

describe("T4844 — the anchor is resolved the way the add op resolves one, and refused with a reason", () => {
  const run = (said: string, selectedIds: string[] = [], pointer: { x: number; y: number } | null = null) => {
    const h = headlessDiagram(world());
    let parked: PickFlow | null = null;
    const ctx = h.context({ selectedIds, pointer });
    ctx.ui.setPickFlow = (f) => { parked = f; };
    const r = applyAssistOps(parseCommand(said)!, ctx);
    return { r, h, parked: parked as PickFlow | null };
  };

  it("nothing selected, or two, is said plainly", () => {
    expect(run("add template after selected").r).toEqual({ ok: false, summary: "nothing is selected" });
    expect(run("add template after selected", ["cs", "r1"]).r.summary).toContain("select just one");
  });

  it("an End, or anything inside an expanded subprocess, is refused before a window opens", () => {
    const end = run("add template after End");
    expect(end.r).toEqual({ ok: false, summary: "a template can’t follow “End” — no sequence flow can leave it" });
    expect(end.h.screen).toEqual([]);
    const inside = run("add template after Inside");
    expect(inside.r).toEqual({ ok: false, summary: "templates can’t be attached inside an expanded subprocess yet" });
    expect(inside.h.screen).toEqual([]);
    // The subprocess itself is fine: the template goes after it, outside.
    expect(run("add template after Handle it").h.screen).toEqual(["template after ep"]);
  });

  it("“before” is refused and the diagram is unchanged", () => {
    const { r, h } = run("add template before Check Stock");
    expect(r).toEqual({ ok: false, summary: TEMPLATE_BEFORE_REFUSAL });
    expect(h.data.elements).toEqual(world().elements);
    expect(h.screen).toEqual([]);
  });

  it("an ambiguous name raises the numbered pick, and the answer opens the window anchored", () => {
    const { r, parked } = run("add template after review");
    expect(r.ok).toBe(true);
    expect(parked).toBeTruthy();
    // The editor re-runs the PARKED op with the choice as an #id ref.
    const h = headlessDiagram(world());
    const again = applyAssistOps(substituteRef(parked!.ops, parked!.ref, "r2") as AssistOp[], h.context());
    expect(again.ok).toBe(true);
    expect(h.screen).toEqual(["template after r2"]);
  });

  it("“here” needs the pointer, and uses it", () => {
    expect(run("add template here").r).toEqual({ ok: false, summary: "I don't know where “here” is — move the mouse over the canvas first" });
    expect(run("add template here", [], { x: 800, y: 200 }).h.screen).toEqual(["template here"]);
    // The bare command still opens the plain window.
    expect(run("add template").h.screen).toEqual(["template"]);
  });
});

describe("T4845 — inside the open window, “after X” moves it and “before X” is refused", () => {
  const cards = cardsOf(numberTemplates([
    { id: "b1", name: "Single Approval", group: "Approvals" },
    { id: "b2", name: "Rework Loop", group: "Loops" },
  ], []));

  it("the stranded tail of “Add template.” … “After selected.” is an anchor, not a name or a number", () => {
    expect(parseTemplateAnswer("After selected.", cards, false)).toEqual({ kind: "anchor", ref: "selected" });
    expect(parseTemplateAnswer("after the gateway", cards, true)).toEqual({ kind: "anchor", ref: "the gateway" });
    expect(parseTemplateAnswer("and after Review", cards, true)).toEqual({ kind: "anchor", ref: "Review" });
    expect(parseTemplateAnswer("put it after Check Stock", cards, true)).toEqual({ kind: "anchor", ref: "Check Stock" });
    expect(parseTemplateAnswer("before the gateway", cards, true)).toEqual({ kind: "before", ref: "the gateway" });
  });

  it("numbers, names, yes and cancel are unchanged", () => {
    expect(parseTemplateAnswer("two", cards, false)).toEqual({ kind: "pick", card: cards[1] });
    expect(parseTemplateAnswer("Single Approval", cards, false)).toEqual({ kind: "pick", card: cards[0] });
    expect(parseTemplateAnswer("yes", cards, true)).toEqual({ kind: "confirm" });
    expect(parseTemplateAnswer("cancel", cards, true)).toEqual({ kind: "cancel" });
    expect(parseTemplateAnswer("here", cards, true), "“here” is not a re-anchor").toBeNull();
  });
});

const src = (p: string) => readFileSync(p, "utf8");

describe("T4857 — the template ask is ONE phrase: the bare command, the anchored one and the add rule's decline agree", () => {
  it("“another”, “one more”, “put”, “place” open the window — never a task called “another template”", () => {
    for (const said of ["add another template", "Add another template.", "add one more template", "put a template", "place a template", "drop in a template", "use another template"]) {
      expect(parseCommand(said), said).toEqual([{ op: "pickTemplate" }]);
    }
    expect(parseCommand("add another template after Review")).toEqual([{ op: "pickTemplate", afterRef: "Review" }]);
    expect(parseCommand("put another template here")).toEqual([{ op: "pickTemplate", at: "pointer" }]);
  });

  it("a full stop after the word is the same pause as a comma", () => {
    // Both halves in one final: "Add template. After selected." went to the AI.
    expect(parseCommand("Add template. After selected.")).toEqual([{ op: "pickTemplate", afterRef: "selected" }]);
    expect(parseCommand("Add template; after the gateway")).toEqual([{ op: "pickTemplate", afterRef: "the gateway" }]);
  });

  it("a verb the template rule does not read goes to the AI — still never a task named for the template", () => {
    for (const said of ["create another template", "create a new template", "give me another template", "create one more template after Review"]) {
      expect(parseCommand(said), said).toBeNull();
    }
    expect(parseCommand("add a task Template Review"), "a name that begins with the word is a name").toEqual([{ op: "add", symbolType: "task", label: "Template Review" }]);
  });

  it("the phrase is written once, in templatePhrase.ts", () => {
    const grammar = src("app/lib/assist/commandGrammar.ts");
    expect(grammar).toContain("if (isBareTemplateCommand(lower)) {");
    expect(grammar).not.toContain("templates?$/i");
    const phrase = src("app/lib/assist/templatePhrase.ts");
    expect(phrase).toContain("export const TEMPLATE_PHRASE = `${TEMPLATE_VERBS}\\\\s+${TEMPLATE_NOUN}`;");
    expect(phrase).toContain("new RegExp(`^(?:${TEMPLATE_PHRASE}|templates?)$`, \"i\")");
    expect(phrase).toContain("new RegExp(`^${TEMPLATE_PHRASE}[,;:.]?\\\\s+(.+)$`, \"i\")");
    expect(src("app/lib/assist/greedyGuards.ts")).toContain("`^${TEMPLATE_NOUN}(?:[,;:.]?\\\\s+(?:");
  });
});

describe("T4858 — one set of place words, read by the add rule, the template rule, the stranded tail, the window and the guard", () => {
  const cards = cardsOf(numberTemplates([{ id: "b1", name: "Single Approval", group: "Approvals" }], []));

  it("the stranded tail and the window take the same lead-ins", () => {
    // Outside the window, as before.
    expect(parseCommand("and after the start")).toEqual([{ op: "connect", fromRef: "the start", toRef: "the last" }]);
    expect(parseCommand("that's after Review")).toEqual([{ op: "connect", fromRef: "Review", toRef: "the last" }]);
    // Inside it, the same words re-anchor — "that's after the gateway" was
    // "say a number…" while the same words outside were a stranded tail.
    expect(parseTemplateAnswer("that's after the gateway", cards, true)).toEqual({ kind: "anchor", ref: "the gateway" });
    expect(parseTemplateAnswer("goes after Review", cards, true)).toEqual({ kind: "anchor", ref: "Review" });
    // The window's own extras: a template is showing for "it" to mean.
    expect(parseTemplateAnswer("move it after Review", cards, true)).toEqual({ kind: "anchor", ref: "Review" });
    expect(parseTemplateAnswer("then after Review", cards, true)).toEqual({ kind: "anchor", ref: "Review" });
  });

  it("“here” is one list: M5 and the template rule", () => {
    expect(parseCommand("add a task called Approve right here")).toEqual([{ op: "add", symbolType: "task", label: "Approve", at: "pointer" }]);
    expect(parseCommand("add a template just there")).toEqual([{ op: "pickTemplate", at: "pointer" }]);
  });

  it("no grammar module keeps a private copy of the words or of the reference tidy-up", () => {
    const grammar = src("app/lib/assist/commandGrammar.ts");
    expect(grammar).toContain("const clean = cleanRef;");
    expect(grammar).toContain("new RegExp(`\\\\s+${HERE_WORDS}$`, \"i\")");
    expect(grammar).toContain("new RegExp(`^(?:${TAIL_LEAD_IN}\\\\s+)?(after|before)\\\\s+(.+)$`, \"i\")");
    const phrase = src("app/lib/assist/templatePhrase.ts");
    expect(phrase).toContain("`^(?:${TAIL_LEAD_IN}|then|(?:add|attach|move)\\\\s+it)[,]?\\\\s+`");
    expect(src("app/lib/assist/greedyGuards.ts")).toContain("${POSITIONAL_WORDS}|${AFTER_WORDS}|${BEFORE_WORDS}|${HERE_WORDS}|");
    for (const f of ["commandGrammar.ts", "templatePhrase.ts", "greedyGuards.ts"]) {
      const text = src(`app/lib/assist/${f}`);
      expect(text, f).not.toContain("(?:here|there)");
      expect(text, f).not.toContain("that'?s");
      expect(text, f).not.toContain("ahead\\\\s+of|in\\\\s+front");
      expect(text, f).not.toContain(`.replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")`);
    }
  });
});

describe("T4860 — inside the window: a template's whole name beats the place words; “after selected” means what was selected", () => {
  const cards = cardsOf(numberTemplates([
    { id: "h", name: "After Hours Escalation", group: "Escalation" },
    { id: "c", name: "Before Close Checklist", group: "Checks" },
    { id: "s", name: "Single Approval", group: "Approvals" },
  ], []));
  const card = (id: string) => cards.find((c) => c.id === id)!;

  it("a whole name picks that template; part of one does not beat an anchor", () => {
    expect(parseTemplateAnswer("After Hours Escalation", cards, false)).toEqual({ kind: "pick", card: card("h") });
    expect(parseTemplateAnswer("after hours escalation.", cards, true)).toEqual({ kind: "pick", card: card("h") });
    expect(parseTemplateAnswer("Before Close Checklist", cards, true)).toEqual({ kind: "pick", card: card("c") });
    expect(parseTemplateAnswer("after hours", cards, true)).toEqual({ kind: "anchor", ref: "hours" });
    expect(parseTemplateAnswer("after Single Approval", cards, true)).toEqual({ kind: "anchor", ref: "Single Approval" });
  });

  it("the editor resolves “selected” without the preview it selected, falling back to the selection the window opened on", () => {
    // Once a number is picked the preview IS the selection, so "after
    // selected" found only the template itself and said "couldn't find".
    const editor = src("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    const start = editor.indexOf("const reanchorTemplate = useCallback(");
    const re = editor.slice(start, editor.indexOf("}, [", start));
    expect(re).toContain("const live = selectedIdsRef.current.filter((id) => !mine.has(id));");
    expect(re).toContain("const selection = live.length ? live : flow.selectionAtOpen;");
    expect(re).toContain("resolveRef(ref, els, voiceLastId.current, selection, {");
    expect(editor).toContain("selectionAtOpen: [...selectedIdsRef.current],");
  });
});
