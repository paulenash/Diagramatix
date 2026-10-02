/**
 * T5215 — Voice Assist "What can I say?" help (Paul, 2026-10-02):
 *   1. Once something is SELECTED the first words are only the commands that apply to it — select an expanded
 *      subprocess and “shrink” is gone, since it applies to pools and lanes.
 *   2. The hover target does NOT narrow the list.
 *   3. The first words are organised: aliases in grey beside the main word; inch, line and once are not listed.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTree, computePanel, defaultCommandTree, DEFAULT_CONVENTIONS, DEFAULT_LISTS, DEFAULT_PATTERNS, parseSections } from "@/app/lib/assist/commandTree";
import { appliesTo, expandKindToken, kindOfConnector, kindOfElement, selectedKinds } from "@/app/lib/assist/commandTree/kinds";
import { standInDiagram } from "@/app/lib/assist/commandTree/standIns";

const tree = defaultCommandTree();
const stand = standInDiagram();
const mains = (kinds: string[], ghost = false) => tree.firstWordGroups({ selected: kinds, ghost }).map((g) => g.main);
const everything = (kinds: string[], ghost = false) => tree.firstWordGroups({ selected: kinds, ghost }).flatMap((g) => [g.main, ...g.aliases]);

describe("T5215 kinds", () => {
  it("every kind of stand-in element is recognised as itself", () => {
    const expected: Record<string, string> = {
      "black-box-pool": "black-box-pool", "white-box-pool": "white-box-pool", lane: "lane", sublane: "sublane", task: "task",
      subprocess: "subprocess", "expanded-subprocess": "expanded-subprocess", "step-in-ep": "task", "start-event": "start-event",
      "end-event": "end-event", "inline-event": "inline-event", "boundary-event": "boundary-event", gateway: "gateway",
      "data-object": "data-object", "data-store": "data-store", "text-annotation": "text-annotation", group: "group",
    };
    for (const [stood, want] of Object.entries(expected)) {
      const e = stand.elementOf(stood)!;
      expect(kindOfElement(e, stand.diagram.elements), stood).toBe(want);
    }
    expect(kindOfConnector({ type: "sequence" })).toBe("sequence-connector");
    expect(kindOfConnector({ type: "messageBPMN" })).toBe("message-connector");
    expect(kindOfConnector({ type: "associationBPMN" })).toBe("association");
  });
  it("selectedKinds reads the selection, or the selected connector; nothing selected is empty", () => {
    const ep = stand.elementOf("expanded-subprocess")!;
    expect(selectedKinds(stand.diagram.elements, [ep.id])).toEqual(["expanded-subprocess"]);
    expect(selectedKinds(stand.diagram.elements, [])).toEqual([]);
    expect(selectedKinds(stand.diagram.elements, [], { type: "sequence" })).toEqual(["sequence-connector"]);
    expect(selectedKinds(stand.diagram.elements, new Set([ep.id, stand.elementOf("task")!.id])).sort()).toEqual(["expanded-subprocess", "task"]);
  });
  it("groups expand to their kinds, and a kind is its own token", () => {
    expect(expandKindToken("pool")).toEqual(["black-box-pool", "white-box-pool"]);
    expect(expandKindToken("task")).toEqual(["task"]);
    expect(expandKindToken("nonsense")).toBeNull();
    expect(appliesTo(["pool", "lane"], ["sublane"])).toBe(true);
    expect(appliesTo(["pool", "lane"], ["expanded-subprocess"])).toBe(false);
  });
});

describe("T5215 1. what is selected narrows the commands", () => {
  it("an EXPANDED SUBPROCESS selected: compress (it fits the EP's height) but no extend / expand / swap — those are pool and lane commands", () => {
    const all = everything(["expanded-subprocess"]);
    for (const w of ["extend", "widen", "expand", "grow", "swap"]) expect(all, w).not.toContain(w);
    for (const w of ["rename", "delete", "move", "add", "unwrap", "surround", "convert", "compress"]) expect(mains(["expanded-subprocess"]), w).toContain(w);
  });
  it("a POOL selected: compress (and its aliases), swap and lanes; not unwrap, surround, convert, connect", () => {
    const m = mains(["white-box-pool"]);
    expect(m).toContain("compress"); expect(m).toContain("swap");
    expect(everything(["white-box-pool"])).toContain("shrink");
    for (const w of ["unwrap", "surround", "convert", "connect", "align", "assign"]) expect(m, w).not.toContain(w);
  });
  it("a TASK selected: convert, assign, align, connect; not compress or unwrap", () => {
    const m = mains(["task"]);
    for (const w of ["convert", "assign", "align", "connect", "rename", "delete"]) expect(m, w).toContain(w);
    for (const w of ["compress", "unwrap", "swap", "reverse"]) expect(m, w).not.toContain(w);
  });
  it("a CONNECTOR selected: reverse; not convert, align, assign, unwrap", () => {
    const m = mains(["sequence-connector"]);
    expect(m).toContain("reverse");
    for (const w of ["convert", "align", "assign", "unwrap", "compress"]) expect(m, w).not.toContain(w);
  });
  it("a GATEWAY selected can swap its points; a task cannot", () => {
    expect(mains(["gateway"])).toContain("swap");
    expect(mains(["task"])).not.toContain("swap");
  });
  it("nothing selected: nothing is filtered — every command, including the whole-diagram ones", () => {
    const m = tree.firstWordGroups({}).map((g) => g.main);
    for (const w of ["compress", "unwrap", "export", "clear", "swap", "extend", "convert", "reverse"]) expect(m, w).toContain(w);
  });
  it("commands that never act on a selection go once something is selected (export, clear the diagram, add a pool)", () => {
    const m = mains(["task"]);
    expect(m).not.toContain("export");
    expect(m).not.toContain("extend");
    expect(m).not.toContain("include");
  });
  it("undo and again stay: they are always relevant", () => {
    for (const w of ["undo", "again"]) expect(mains(["expanded-subprocess"]), w).toContain(w);
  });
  it("Assist's own words (accept, take) are a matter of ghost suggestions, not of the selection", () => {
    expect(everything(["task"], false)).not.toContain("accept");
    expect(everything(["task"], false)).not.toContain("take");
    expect(mains(["task"], true)).toContain("accept");
    expect(everything(["task"], true)).toContain("take");
  });
  it("the words that FOLLOW are narrowed too: after “add” with a task selected, no lane or pool", () => {
    const after = tree.next(["add"], { selected: ["task"] }).next.map((i) => i.text);
    expect(after).not.toContain("lane");
    expect(after).not.toContain("pool");
  });
});

describe("T5215 2. the hover target does not narrow", () => {
  it("computePanel takes only SELECTED kinds — with none given the list is the full one", () => {
    const base = { interim: "", ghost: false, flow: null };
    expect(computePanel(tree, base).lines).toEqual(computePanel(tree, { ...base, selectedKinds: [] }).lines);
    expect(computePanel(tree, { ...base, selectedKinds: ["task"] }).lines).not.toContain("compress");
    expect(computePanel(tree, base).lines).toContain("compress");
  });
  it("the editor feeds it the selection, never the pointer or the target", () => {
    const editor = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    expect(editor).toContain("selectedKinds: selectedKindsOf(data.elements, selectedElementIds, selectedConnector),");
    const at = editor.indexOf("selectedKinds: selectedKindsOf");
    expect(editor.slice(at - 400, at + 200)).not.toMatch(/helpTarget|pointerWorld|cursor/);
  });
  it("the phone feeds it the selection too", () => {
    expect(readFileSync("app/components/mobile/MobileVoiceEditor.tsx", "utf8")).toContain("selectedKinds: selectedKindsOf(data.elements, selectedElementIds, selectedConnector)");
  });
});

describe("T5215 3. the first words, organised", () => {
  const first = tree.firstWordGroups({});
  it("aliases sit beside their main word, and are no longer words of their own", () => {
    const alias = (m: string) => first.find((g) => g.main === m)?.aliases ?? [];
    expect(alias("add")).toEqual(expect.arrayContaining(["insert", "create", "put", "place"]));
    expect(alias("move")).toEqual(expect.arrayContaining(["nudge", "bump", "shift"]));
    expect(alias("delete")).toEqual(expect.arrayContaining(["remove", "erase"]));
    expect(alias("rename")).toContain("relabel");
    const mainsNow = first.map((g) => g.main);
    for (const w of ["insert", "nudge", "remove", "relabel", "shrink", "put"]) expect(mainsNow, w).not.toContain(w);
  });
  it("INCH, LINE and ONCE are not listed — as a main word or an alias", () => {
    const shown = first.flatMap((g) => [g.main, ...g.aliases]);
    for (const w of ["inch", "line", "once"]) expect(shown, w).not.toContain(w);
  });
  it("…but they still work: the tree still accepts a sentence that starts with one", () => {
    expect(tree.firstWords({}).map((i) => i.text)).toEqual(expect.arrayContaining(["inch", "line", "once"]));
    expect(tree.accepts("once more")).toBe(true);
    expect(tree.accepts("line these up")).toBe(true);
  });
  it("the main words are A–Z", () => {
    const m = first.map((g) => g.main);
    expect(m).toEqual([...m].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
  });
  it("a word that is an alias of two mains (“set”) is beside both, and never alone", () => {
    expect(first.find((g) => g.main === "convert")?.aliases).toContain("set");
    expect(first.find((g) => g.main === "label")?.aliases).toContain("set");
    expect(first.map((g) => g.main)).not.toContain("set");
  });
  it("the panel carries the groups for the first words, with `lines` holding just the main words", () => {
    const v = computePanel(tree, { interim: "", ghost: false, flow: null });
    expect(v.groups?.length).toBeGreaterThan(10);
    expect(v.lines).toEqual(v.groups!.map((g) => g.main));
    // …and not for the words that follow
    expect(computePanel(tree, { interim: "rename", ghost: false, flow: null }).groups).toBeUndefined();
  });
  it("both panels draw the aliases in grey", () => {
    expect(readFileSync("app/components/canvas/VoiceAssistHelpPanel.tsx", "utf8")).toContain("function WordWithAliases");
    expect(readFileSync("app/components/mobile/MobileVoiceEditor.tsx", "utf8")).toContain("helpView.groups && helpView.groups.map");
  });
});

describe("T5215 the notation", () => {
  it("the shipped patterns carry no error (every @on names a real kind), and use all three annotations", () => {
    expect(tree.errors).toEqual([]);
    expect(DEFAULT_PATTERNS).toMatch(/@on pool lane/);
    expect(DEFAULT_PATTERNS).toMatch(/@nosel/);
    expect(DEFAULT_PATTERNS).toContain("## aliases");
    expect(DEFAULT_PATTERNS).toContain("## hidden");
  });
  it("@on, @nosel, ## aliases and ## hidden parse; an unknown kind is an error on its line", () => {
    const r = parseSections(["## commands", "shrink it @on pool", "export it @nosel", "x @on nonsense", "## aliases", "shrink: squash squeeze", "## hidden", "inch line"].join("\n"));
    expect(r.sections.commands[0].on).toEqual(["pool"]);
    expect(r.sections.commands[1].noSel).toBe(true);
    expect(r.errors.map((e) => e.message).join(" ")).toContain("nonsense");
    expect(r.aliases).toEqual({ shrink: ["squash", "squeeze"] });
    expect(r.hidden).toEqual(["inch", "line"]);
  });
  it("an annotation never changes what a sentence means: the same sentences are accepted with and without a selection filter", () => {
    const t = compileTree(["## commands", "shrink the <existing_element_name> @on pool", "undo"].join("\n"), DEFAULT_CONVENTIONS, DEFAULT_LISTS);
    expect(t.accepts("shrink the Customer")).toBe(true);
    expect(t.accepts("shrink the Customer", { selected: ["task"] })).toBe(false);   // not relevant to a task — only the LIST is narrowed
    expect(t.accepts("undo", { selected: ["task"] })).toBe(true);
  });
});
