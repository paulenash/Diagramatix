/**
 * Voice Assist Bubble Help — slice 1: the command tree engine.
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 */
import { describe, it, expect } from "vitest";
import {
  compileTree, defaultCommandTree, DEFAULT_CONVENTIONS, parsePattern, parseSections, tokenise,
  type Lists,
} from "@/app/lib/assist/commandTree";

const LISTS: Lists = { dirs: ["up", "down", "left", "right"], kinds: ["task", "parallel gateway"] };
const tree = (text: string) => compileTree(text, DEFAULT_CONVENTIONS, LISTS);
const words = (t: ReturnType<typeof tree>, said: string, ctx = {}) => t.next(tokenise(said), ctx).next.map((i) => (i.kind === "slot" ? `<${i.text}>` : i.text));

describe("T5161 — the notation", () => {
  it("reads words, tight alternatives, groups, optionals, slots and lists", () => {
    expect(parsePattern("go a|b").map((n) => n.t)).toEqual(["word", "alt"]);
    expect(parsePattern("go (x y | z) [q] <existing_element_name> {dirs}").map((n) => n.t)).toEqual(["word", "alt", "opt", "slot", "list"]);
  });

  it("inside parentheses a bar ALWAYS separates choices, even mid-chunk; a choice may be several words", () => {
    const n = parsePattern("(a b|c)")[0];
    expect(n.t === "alt" && n.branches.map((b) => b.length)).toEqual([2, 1]);
  });

  it("says what is wrong, in plain English, and keeps the lines that parsed", () => {
    const r = parseSections("good line\nbad ( line\nalso | bad\n[ ]\nfine too");
    expect(r.sections.commands.map((p) => p.source)).toEqual(["good line", "fine too"]);
    expect(r.errors.map((e) => e.line)).toEqual([2, 3, 4]);
    expect(r.errors[0].message).toMatch(/missing \)/);
    expect(r.errors[1].message).toMatch(/needs parentheses/);
  });

  it("sections: commands is the default; assist, voice and flow <id> are named; # comments are ignored", () => {
    const r = parseSections("one # a comment\n## assist\ntwo\n## flow rename-pick\nthree\n## nonsense\nfour");
    expect(Object.keys(r.sections)).toEqual(["commands", "assist", "flow rename-pick"]);
    expect(r.sections.commands.map((p) => p.source)).toEqual(["one"]);
    expect(r.errors).toEqual([{ line: 6, message: expect.stringContaining("unknown section") }]);
  });

  it("flags a <slot> with no convention and a {list} that does not exist", () => {
    const t = tree("say <nobody> {nothing}");
    expect(t.errors.map((e) => e.message).join("|")).toMatch(/no convention for <nobody>/);
    expect(t.errors.map((e) => e.message).join("|")).toMatch(/no list called \{nothing\}/);
  });
});

describe("T5162 — what can come next", () => {
  const t = tree(`
    rename (pools|lanes)
    rename <existing_element_name> to <new_element_name>
    rename <existing_label_name> to <new_label_name>
    move <existing_element_name> [<number> steps] {dirs}
    add [a|an] {kinds} [called <new_element_name>]
    undo [that]
  `);

  it("no words yet: the first words, once each, in pattern order", () => {
    expect(words(t, "")).toEqual(["rename", "move", "add", "undo"]);
  });

  it("after “rename”: the type words AND the two name variables — Paul's example", () => {
    expect(words(t, "rename")).toEqual(["pools", "lanes", "<existing_element_name>", "<existing_label_name>"]);
  });

  it("a variable takes several words, and “to” stays offered while it is open", () => {
    const r = t.next(tokenise("rename review claim"));
    expect(r.openSlot).toBe("existing_label_name");
    const offered = r.next.map((i) => (i.kind === "slot" ? `<${i.text}>` : i.text));
    expect(offered).toContain("to");
    expect(r.next.find((i) => i.text === "existing_element_name")?.more).toBe(true);
    expect(words(t, "rename review claim to")).toEqual(expect.arrayContaining(["<new_element_name>", "<new_label_name>"]));
  });

  it("optional words are marked, and only the ones inside [ ]", () => {
    const r = t.next(["add"]);
    const byText = Object.fromEntries(r.next.map((i) => [i.text, i.optional]));
    expect(byText).toMatchObject({ a: true, an: true, task: false, "parallel": false });
  });

  it("list entries may be phrases: “parallel gateway” is two words", () => {
    expect(words(t, "add parallel")).toEqual(["gateway"]);
    expect(t.accepts("add a parallel gateway")).toBe(true);
    expect(t.accepts("add a parallel")).toBe(false);
  });

  it("knows when a command is complete, and when it could still go on", () => {
    expect(t.next(tokenise("undo")).complete).toBe(true);
    expect(t.next(tokenise("undo that")).complete).toBe(true);
    expect(t.next(tokenise("rename")).complete).toBe(false);
    expect(t.accepts("rename lanes")).toBe(true);
    expect(t.accepts("rename review claim to finance review")).toBe(true);
    expect(t.accepts("rename review claim")).toBe(false);
  });

  it("words that fit nothing give ok:false and no next words", () => {
    const r = t.next(tokenise("frobnicate"));
    expect(r).toMatchObject({ ok: false, next: [], complete: false });
  });

  it("is a pure function of the words: asking again, or in any order of asking, gives the same answer", () => {
    const a = t.next(tokenise("move review claim two steps"));
    t.next(tokenise("rename"));
    expect(t.next(tokenise("move review claim two steps"))).toEqual(a);
  });

  it("a number takes “twenty two” (two words) and digits", () => {
    expect(t.accepts("move review claim 3 steps left")).toBe(true);
    expect(t.accepts("move review claim twenty two steps left")).toBe(true);
    expect(t.accepts("move review claim left")).toBe(true);
  });
});

describe("T5163 — sections change what is offered", () => {
  const t = tree(`
    undo
    ## assist
    accept [the] suggestion
    ## voice
    stop
    ## flow dividers
    <number> (up|down) [<distance>]
    done
  `);

  it("assist words appear only while ghost suggestions are showing", () => {
    expect(words(t, "")).toEqual(["undo"]);
    expect(words(t, "", { ghost: true })).toEqual(["undo", "accept"]);
  });

  it("the microphone words are opt-in", () => {
    expect(words(t, "", { voice: true })).toEqual(["undo", "stop"]);
  });

  it("an open flow replaces the commands entirely with its own", () => {
    expect(words(t, "", { flow: "dividers" })).toEqual(["<number>", "done"]);
    expect(words(t, "2", { flow: "dividers" })).toEqual(["up", "down"]);
    expect(t.accepts("2 down 100 pixels", { flow: "dividers" })).toBe(true);
    expect(t.accepts("2 down a bit", { flow: "dividers" })).toBe(true);
    expect(t.accepts("undo", { flow: "dividers" })).toBe(false);
    expect(words(t, "", { flow: "no-such-flow" })).toEqual([]);
  });
});

describe("T5164 — the shipped tree", () => {
  const t = defaultCommandTree();

  it("compiles with no errors", () => {
    expect(t.errors).toEqual([]);
  });

  it("starts with Paul's first words, and Assist adds a few more", () => {
    const first = t.firstWords().map((i) => i.text);
    for (const w of ["add", "align", "assign", "connect", "convert", "delete", "insert", "move", "make", "nudge", "put", "rename"]) expect(first, w).toContain(w);
    const extra = t.firstWords({ ghost: true }).map((i) => i.text).filter((w) => !first.includes(w));
    expect(extra).toEqual(["accept", "take"]);
  });

  it("after “rename”: the type words, then both name variables and the pointing words — all in Paul's notation", () => {
    const next = t.next(["rename"]).next;
    const texts = next.map((i) => (i.kind === "slot" ? `<${i.text}>` : i.text));
    for (const w of ["pools", "lanes", "tasks", "activities", "subprocesses", "gateways", "events", "messages", "connectors", "<existing_element_name>", "<existing_label_name>", "<target>"]) {
      expect(texts, w).toContain(w);
    }
  });

  it("“this” and “the one under the cursor” are first-class: <target> takes both", () => {
    expect(t.accepts("rename this to Approved")).toBe(true);
    expect(t.accepts("rename that to Approved")).toBe(true);
    expect(t.accepts("rename the selected task to Approved")).toBe(true);
    expect(t.accepts("rename the one under the cursor to Approve")).toBe(true);
    expect(t.accepts("connect this to Pay Claim")).toBe(true);
  });

  it("the four names are defined, with a meaning and an example, and so is every other variable in use", () => {
    const names = DEFAULT_CONVENTIONS.map((c) => c.name);
    for (const n of ["existing_element_name", "existing_label_name", "new_element_name", "new_label_name", "target", "selection", "number", "distance"]) expect(names, n).toContain(n);
    for (const c of DEFAULT_CONVENTIONS) {
      expect(c.means.length, c.name).toBeGreaterThan(20);
      expect(c.example, c.name).toBeTruthy();
    }
  });

  it("the summary table has one row per first word, each with its own next words", () => {
    const rows = t.summary();
    // one row per first word, A–Z (Paul, 2026-10-01)
    expect(rows.map((r) => r.word)).toEqual(t.firstWords().filter((i) => i.kind === "word").map((i) => i.text).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" })));
    // A word with nothing after it is a whole command on its own ("again", "repeat").
    expect(rows.filter((r) => r.next.length === 0).every((r) => t.next([r.word]).complete)).toBe(true);
    expect(rows.find((r) => r.word === "rename")!.next.length).toBeGreaterThan(10);
  });
});
