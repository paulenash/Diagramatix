/**
 * Voice Assist Help — slice 4: the "Check against the parser" report, and the tile's microphone.
 * Plan: new features/voice-assist-help-plan-2026-10-01.md
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  compileTree, consistencyReport, DEFAULT_CONVENTIONS, DEFAULT_LISTS, DEFAULT_SAMPLE_FILL, defaultCommandTree, isMeaningless, namesOf,
} from "@/app/lib/assist/commandTree";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { COMMAND_CATALOG, SUPERADMIN_COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { generateCases } from "@/app/lib/assist/commandGenerator";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import frozenKey from "@/app/lib/assist/catalogCorpus.expected.json";

const fx = fixtureDiagram();
const card: string[] = [];
for (const fam of [...COMMAND_CATALOG, ...SUPERADMIN_COMMAND_CATALOG]) for (const it of fam.items) if (!it.voice) card.push(...it.say);
const frozen = Object.keys(frozenKey);
const parses = (s: string) => !!parseCommand(s);
const generated = (seed: string, count = 600) => generateCases({ seed, count, world: fx.elements }).map((c) => c.utterance);
const tree = defaultCommandTree();

describe("T5183 — the report finds drift in BOTH directions", () => {
  it("a pattern the parser does not take is reported against its line", () => {
    const t = compileTree("frobnicate <number>\nundo", DEFAULT_CONVENTIONS, DEFAULT_LISTS);
    const r = consistencyReport(t, { fill: DEFAULT_SAMPLE_FILL, card: [], frozen: [], generated: [], parses });
    expect(r.treeNotParser).toEqual([{ sentence: "frobnicate 3", source: "line 1" }]);
    expect(r.parserNotTree).toEqual([]);
  });

  it("a sentence the parser takes but the patterns lack is reported, with where it came from, once", () => {
    const t = compileTree("undo", DEFAULT_CONVENTIONS, DEFAULT_LISTS);
    const r = consistencyReport(t, { fill: DEFAULT_SAMPLE_FILL, card: ["connect them", "undo"], frozen: ["connect them"], generated: ["rename tasks"], parses });
    expect(r.parserNotTree).toEqual([
      { sentence: "connect them", source: "card" },
      { sentence: "rename tasks", source: "generated" },
    ]);
  });

  it("a sentence the parser does NOT take is never held against the tree", () => {
    const t = compileTree("undo", DEFAULT_CONVENTIONS, DEFAULT_LISTS);
    const r = consistencyReport(t, { fill: DEFAULT_SAMPLE_FILL, card: ["frobnicate the widget"], frozen: [], generated: [], parses });
    expect(r.parserNotTree).toEqual([]);
  });

  it("the counts say what was checked", () => {
    const r = consistencyReport(tree, { fill: DEFAULT_SAMPLE_FILL, card, frozen, generated: generated("alpha", 50), parses });
    expect(r.checked.card).toBe(card.length);
    expect(r.checked.frozen).toBe(frozen.length);
    expect(r.checked.generated).toBe(50);
    expect(r.checked.fromTree).toBeGreaterThan(2500);
  });

  it("parser → tree is about WORDING: a name the diagram lacks (the card's “sublane Sub 2”) is not drift", () => {
    const r = consistencyReport(tree, { fill: DEFAULT_SAMPLE_FILL, card, frozen, generated: [], parses, ctx: { names: namesOf(fx.elements, fx.connectors) } });
    expect(r.parserNotTree).toEqual([]);
  });

  it("meaningless pairs (“move top to top”) are skipped, not reported", () => {
    expect(isMeaningless("move top to top")).toBe(true);
    expect(isMeaningless("move the selected gateway middle to centre")).toBe(true);
    expect(isMeaningless("move top to bottom")).toBe(false);
  });
});

describe("T5184 — the shipped patterns and the parser agree: nothing either way, across five generated sets", () => {
  it("no disagreement from the patterns, the card, the frozen key, or 3,000 generated sentences", () => {
    for (const seed of ["dgx-voice-1", "alpha", "beta", "gamma", "delta"]) {
      const r = consistencyReport(tree, { fill: DEFAULT_SAMPLE_FILL, card, frozen, generated: generated(seed), parses });
      expect(r.treeNotParser.slice(0, 5), `${seed}: tree → parser`).toEqual([]);
      expect(r.parserNotTree.slice(0, 5), `${seed}: parser → tree`).toEqual([]);
    }
  });
});

describe("T5185 — with the diagram's own names the names rule accepts what is really said", () => {
  it("every generated sentence is made of this diagram's real names, so the tree accepts it with names switched on", () => {
    const names = namesOf(fx.elements, fx.connectors);
    const bad: string[] = [];
    for (const seed of ["dgx-voice-1", "alpha", "beta"]) {
      for (const s of generated(seed)) {
        if (parses(s) && !tree.accepts(s, { ghost: true, names })) bad.push(s);
      }
    }
    // Unique, and shown in full if it fails — each one is either a name the rule wrongly refuses or a wording to add.
    expect([...new Set(bad)].slice(0, 15)).toEqual([]);
  });
});

describe("T5186 — the tile: Speak and the check, wired as described", () => {
  const read = (...p: string[]) => readFileSync(p.join("/"), "utf8").replace(/\r\n/g, "\n");
  const client = read("app/(dashboard)/dashboard/admin/voice-assist-help/VoiceAssistHelpClient.tsx");

  it("Speak uses the editor's recogniser (startDictation), hints it with the test diagram's names, and keeps finished phrases", () => {
    expect(client).toContain("startDictation({");
    expect(client).toContain("keyterms: diagramKeyterms(fx.elements.map((e) => e.label))");
    expect(client).toContain("onInterim:");
    expect(client).toContain('finals.current = `${finals.current} ${t}`.trim()');
  });

  it("the microphone is stopped when the page goes away, and by the button", () => {
    expect(client).toContain("useEffect(() => () => { handleRef.current?.stop(); }, []);");
    expect(client).toContain("stopMic()");
    expect(client).toContain("Clear");
  });

  it("the check runs against the DRAFT tree, with the card, the frozen key and a generated set", () => {
    expect(client).toContain("<CheckAgainstParser tree={tree} />");
    expect(client).toContain("consistencyReport(tree, {");
    expect(client).toContain("fill: DEFAULT_SAMPLE_FILL");
    expect(client).toContain("Object.keys(frozenKey)");
    expect(client).toContain("generateCases({");
    expect(client).not.toMatch(/window\.(confirm|alert|prompt)/);
  });

  it("the report module has no server or DOM dependencies, so the tile and the tests run the same check", () => {
    const mod = read("app/lib/assist/commandTree/consistencyReport.ts");
    expect(mod).not.toMatch(/from "@\/app\/lib\/db"|prisma|document\.|window\./);
  });
});
