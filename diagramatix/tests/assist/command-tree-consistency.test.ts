/**
 * Voice Assist Help — the command tree must agree with the parser.
 *
 * The tree is a LENS (Paul's ruling, 2026-10-01): `parseCommand` still acts on commands.
 * The danger is drift — the help offering words the parser will not take, or the parser
 * taking sentences the help never offers. These tests catch both, in both directions:
 *
 *   tree → parser   every sentence the shipped patterns describe must parse
 *   parser → tree   every sentence in the Commands card must be accepted by the tree
 *
 * Plan: new features/voice-assist-help-plan-2026-10-01.md (slice 1).
 */
import { describe, it, expect } from "vitest";
import { defaultCommandTree, DEFAULT_LISTS } from "@/app/lib/assist/commandTree";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { parseRenameType } from "@/app/lib/assist/renameTargets";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { collectDividers, readDividerUtterance } from "@/app/lib/assist/dividerFlow";

const tree = defaultCommandTree();

const FILL = {
  existing_element_name: ["Review Claim", "Underwriters"],
  existing_label_name: ["Payment Details"],
  new_element_name: ["Finance Review"],
  new_label_name: ["Approved"],
  number: ["3"],
  distance: ["100 pixels"],
  target: ["this", "the selected task"],
  selection: ["these", "the selected tasks"],
};

/**
 * Sentences the patterns describe that MEAN nothing, so no parser would take them:
 * "move top to top", "swap middle and centre" (the same point twice).
 */
const POINT = (w: string) => (w === "centre" || w === "center" ? "middle" : w);
function isMeaningless(sentence: string): boolean {
  const m = sentence.match(/^(?:move|swap)(?: .*?)? (top|middle|bottom|left|right|centre|center) (?:to|and|with) (top|middle|bottom|left|right|centre|center)$/);
  return !!m && POINT(m[1]) === POINT(m[2]);
}

/**
 * Sentences the tree describes that the parser does not take. May only ever SHRINK — a
 * line here is a debt, not a decision. Empty today.
 */
const TREE_BUT_NOT_PARSER: readonly string[] = [];

/** Card sentences the tree does not accept. May only ever shrink. Empty today. */
const PARSER_BUT_NOT_TREE: readonly string[] = [];

describe("T5165 — tree → parser: every sentence the shipped patterns describe parses", () => {
  const samples = tree.samples("commands", FILL, 120).filter((s) => !isMeaningless(s.sentence));

  it("there are plenty of them (so this is not passing on an empty set)", () => {
    expect(samples.length).toBeGreaterThan(2500);
  });

  it("every one is accepted by parseCommand, bar the written-down debts", () => {
    const bad = samples.filter((s) => !parseCommand(s.sentence)).map((s) => `L${s.pattern.line}: ${s.sentence}`);
    const unexpected = bad.filter((b) => !TREE_BUT_NOT_PARSER.some((d) => b.endsWith(d)));
    expect(unexpected.slice(0, 20)).toEqual([]);
    // A debt that is no longer one must be deleted, so the list can only shrink.
    const stale = TREE_BUT_NOT_PARSER.filter((d) => !bad.some((b) => b.endsWith(d)));
    expect(stale).toEqual([]);
  });

  it("every pattern line contributes at least one sample", () => {
    const lines = new Set(samples.map((s) => s.pattern.line));
    for (const p of tree.sections.commands) {
      if (/^(?:move|swap)\b.*\{points\}/.test(p.source)) continue; // its only meaningful samples are checked above
      expect(lines.has(p.line), `line ${p.line}: ${p.source}`).toBe(true);
    }
  });
});

describe("T5166 — parser → tree: every sentence on the Commands card is accepted", () => {
  const cardLines: string[] = [];
  for (const fam of [...COMMAND_CATALOG, ...SUPERADMIN_COMMAND_CATALOG]) {
    for (const item of fam.items) {
      if (item.voice) continue;
      for (const say of item.say) cardLines.push(say);
    }
  }

  it("covers the whole card", () => {
    expect(cardLines.length).toBeGreaterThan(100);
  });

  it("the tree accepts each one (with Assist suggestions showing, so “accept the suggestion” counts)", () => {
    const rejected = cardLines.filter((s) => !tree.accepts(s, { ghost: true }) && !PARSER_BUT_NOT_TREE.includes(s));
    expect(rejected).toEqual([]);
    const stale = PARSER_BUT_NOT_TREE.filter((s) => tree.accepts(s, { ghost: true }));
    expect(stale).toEqual([]);
  });

  it("every first word on the card is a first word in the tree", () => {
    const first = new Set(tree.firstWords({ ghost: true }).map((i) => i.text));
    const missing = [...new Set(cardLines.map((s) => s.split(/\s+/)[0].toLowerCase()))].filter((w) => !first.has(w));
    expect(missing).toEqual([]);
  });
});

describe("T5167 — the tree's word lists are the parser's words", () => {
  it("every {type_words} entry is a type the rename-by-number flow knows", () => {
    for (const w of DEFAULT_LISTS.type_words) expect(parseRenameType(w), w).not.toBeNull();
  });

  it("every {element_kinds} entry works after “add a …”", () => {
    for (const k of DEFAULT_LISTS.element_kinds) expect(parseCommand(`add a ${k}`), k).toBeTruthy();
  });

  it("every {convert_kinds} entry works after “make Review Claim a …”", () => {
    for (const k of DEFAULT_LISTS.convert_kinds) expect(parseCommand(`make Review Claim a ${k}`), k).toBeTruthy();
  });

  it("every {compress_verbs} entry compresses a pool", () => {
    for (const v of DEFAULT_LISTS.compress_verbs) expect(parseCommand(`${v} the Customer pool`), v).toBeTruthy();
  });
});

describe("T5168 — the divider flow's sub-grammar matches what the flow reads", () => {
  const targets = collectDividers(fixtureDiagram().elements);

  it("every divider answer the tree allows is read by the flow", () => {
    for (const said of ["1 up 100 pixels", "2 down a bit", "1 up", "2 down 20", "done"]) {
      expect(tree.accepts(said, { flow: "dividers" }), said).toBe(true);
      expect(readDividerUtterance(said, targets, {}) !== null || said === "done", said).toBe(true);
    }
  });

  it("the flow has three states, and each lists only what the flow reads in that state", () => {
    const first = (flow: string) => tree.firstWords({ flow }).map((i) => (i.kind === "slot" ? `<${i.text}>` : i.text));
    // Just opened: Paul's reading — only a number, or done.
    expect(first("dividers")).toEqual(["<number>", "done"]);
    // A number is waiting for its way.
    expect(first("dividers-held")).toEqual(expect.arrayContaining(["up", "down", "<distance>", "<number>", "done"]));
    // After a move: another divider, or an amount to adjust the last move — not a bare up/down.
    expect(first("dividers-moved")).toEqual(["<number>", "<distance>", "done"]);
  });

  it("the flow reads exactly what each state offers: a bare way only after a held number, a bare amount only after a move", () => {
    const targets2 = collectDividers(fixtureDiagram().elements);
    // after a held number
    expect(readDividerUtterance("down", targets2, { pendingN: 1 })?.kind).toBe("move");
    expect(readDividerUtterance("down", targets2, {})).toBeNull();
    // after a move: an amount alone adjusts it
    const moved = { last: { id: targets2[0].id, n: 1, direction: "down" as const, moved: 20 } };
    expect(readDividerUtterance("fifty pixels", targets2, moved)?.kind).toBe("adjust");
    expect(readDividerUtterance("fifty pixels", targets2, {})).toBeNull();
  });
});
