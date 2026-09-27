/**
 * The "New commands: dividers, convert, contents (50)" voice test set.
 *
 * Paul, 2026-09-27: "Construct a set of 50 voice commands covering the new
 * commands added to 1. move lane dividers, convert, Move lane contents and put
 * them in Voice Assist Test for me to explore these new commands and their
 * reliability."
 *
 * The set's answer key is written by hand (newCommandsCorpus.ts), so this file
 * is where a parser change that moves one of the fifty turns red.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  NEW_COMMANDS_SET_ID, NEW_COMMAND_CASES, DIVIDERS, CONVERT, CONTENTS,
  newCommandCases, newCommandCaseId, refusalReason,
} from "@/app/lib/assist/newCommandsCorpus";
import { CORPUS_SETS, corpusSet, casesForSet, familiesForSet } from "@/app/lib/assist/corpusSets";
import { FAMILY_NAMES } from "@/app/lib/assist/commandGenerator";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { scoreCase } from "@/app/lib/assist/commandScore";
import { scoreApply } from "@/app/lib/assist/applyScore";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureElements, fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { CATALOG_SET_ID } from "@/app/lib/assist/catalogCorpus";
import { orderReplaySets, replaySetLabel } from "@/app/lib/dictation/replaySets";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const world = fixtureElements();
const cases = newCommandCases();
const OP_OF: Record<string, string> = { [DIVIDERS]: "movePoolBoundary", [CONVERT]: "convertActivity", [CONTENTS]: "moveContents" };

describe("T4969 — the new-commands set: fifty cases, registered, ids from the words", () => {
  it("exactly 50 — 20 dividers, 12 converts, 18 contents moves — each of its own command", () => {
    expect(cases).toHaveLength(50);
    const n = (f: string) => cases.filter((c) => c.family === f).length;
    expect([n(DIVIDERS), n(CONVERT), n(CONTENTS)]).toEqual([20, 12, 18]);
    for (const c of cases) {
      expect(c.ops.length, c.utterance).toBe(1);
      expect(c.ops[0].op, c.utterance).toBe(OP_OF[c.family]);
    }
    expect(new Set(cases.map((c) => c.utterance)).size, "no sentence twice").toBe(50);
  });

  it("ids are unique and come from the words, under the set's own id — which recorded clips carry", () => {
    expect(NEW_COMMANDS_SET_ID).toBe("dgx-voice-new-commands-2026-09-27");
    const ids = cases.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of cases) expect(c.id).toBe(newCommandCaseId(c.utterance));
    expect(newCommandCaseId("move everything from selected, in Underwriters, 100 pixels to the right"))
      .toBe(`${NEW_COMMANDS_SET_ID}#move-everything-from-selected-in-underwriters-100-pixels-to-the-right`);
    expect(newCommandCases().map((c) => c.id), "the same every time").toEqual(ids);
  });

  it("is in the registry as a fixed list, so the Set drop-down on all three tabs offers it", () => {
    const s = corpusSet(NEW_COMMANDS_SET_ID)!;
    expect(s).toBeDefined();
    expect(s.kind, "a fixed list — the Cases / Sentences box is disabled for it").toBe("catalog");
    expect(s.label).toBe("New commands: dividers, convert, contents (50)");
    expect(s.explain.length).toBeGreaterThan(60);
    expect(CORPUS_SETS.map((x) => x.id)).toContain(NEW_COMMANDS_SET_ID);
    expect(casesForSet(NEW_COMMANDS_SET_ID, { count: 3, world }), "every case, whatever the count").toEqual(cases);
    expect(casesForSet(NEW_COMMANDS_SET_ID, { count: 3, world, families: [CONVERT] })).toEqual(cases.filter((c) => c.family === CONVERT));
    expect(familiesForSet(NEW_COMMANDS_SET_ID, FAMILY_NAMES)).toEqual([DIVIDERS, CONVERT, CONTENTS]);
  });

  it("the answer key is written by hand — the module never reads the grammar", () => {
    const src = read("app/lib/assist/newCommandsCorpus.ts");
    const imports = src.split("\n").filter((l) => /^\s*import\b/.test(l));
    expect(imports.join("\n")).not.toMatch(/commandGrammar|poolBoundaryPhrase|selectedWord|convertPhrase|\.json/);
    expect(src).not.toMatch(/parseCommand\(/);
    // …and a case handed to a scorer is a copy: the key cannot be edited by a run.
    const c = newCommandCases()[0];
    (c.ops[0] as { direction: string }).direction = "down";
    expect(NEW_COMMAND_CASES[0].ops[0]).toMatchObject({ direction: "up" });
  });
});

describe("T4970 — every case that can be judged passes L1–L3 and L4 on the test diagram", () => {
  it("L1–L3: every case parses to its hand-written key; every one that is not parse-only resolves to the right element", () => {
    const connectors = fixtureDiagram().connectors;
    const bad: string[] = [];
    for (const c of cases) {
      const r = scoreCase(c, undefined, world, { connectors });
      if (r.outcome !== "pass") bad.push(`${r.outcome}: “${c.utterance}” — ${r.detail}`);
    }
    expect(bad).toEqual([]);
  });

  it("L4: none that is not parse-only is refused or comes out wrong — as the Test tab scores it", () => {
    const bad: string[] = [];
    for (const c of cases) {
      if (c.parseOnly) continue;
      const r = scoreCase(c, undefined, world, { diagram: fixtureDiagram() });
      if (r.outcome !== "pass") bad.push(`${r.outcome}: “${c.utterance}” — ${r.detail}`);
    }
    expect(bad).toEqual([]);
    // 42: "move Underwriters bottom boundary down" is judged since touching stopped counting as crossing (2026-09-27).
    expect(cases.filter((c) => !c.parseOnly)).toHaveLength(42);
  });

  it("the ones that must be REFUSED are refused, with the words written in the set, and change nothing", () => {
    const refusing = NEW_COMMAND_CASES.filter((c) => c.refuses);
    expect(refusing.map((c) => c.family)).toEqual([DIVIDERS, DIVIDERS, CONVERT, CONVERT, CONTENTS, CONTENTS, CONTENTS]);
    for (const c of refusing) {
      const ops = parseCommand(c.say)!;
      expect(ops, c.say).not.toBeNull();
      const v = scoreApply(ops, fixtureDiagram(), c.needsSelection ?? []);
      expect(v.ok, `${c.say} should be refused, and said: ${v.summary}`).toBe(false);
      expect(v.summary, c.say).toContain(c.refuses!);
      const h = headlessDiagram(fixtureDiagram());
      const before = structuredClone(h.data);
      applyAssistOps(ops, h.context({ selectedIds: c.needsSelection ?? [] }));
      expect(h.data, `${c.say} left the diagram as it was`).toEqual(before);
    }
  });

  it("a divider refusal names the room, and exactly that room then moves (the set measures the refusal, not a dead end)", () => {
    for (const c of NEW_COMMAND_CASES.filter((x) => x.family === DIVIDERS && x.refuses)) {
      const room = Number(c.refuses!.match(/at most (\d+)px/)![1]);
      const op = parseCommand(c.say)![0];
      if (op.op !== "movePoolBoundary") throw new Error(`${c.say} parsed as ${op.op}`);
      expect(op.distance ?? 20, `${c.say} asked for more than the room`).toBeGreaterThan(room);
      const h = headlessDiagram(fixtureDiagram());
      const r = applyAssistOps([{ ...op, distance: room }], h.context());
      expect(r.ok, `${c.say}, by ${room}: ${r.summary}`).toBe(true);
    }
  });
});

describe("T4971 — what cannot be judged says why", () => {
  it("parse-only is the seven refusals and the one sub-lane line — each with its reason written out", () => {
    const po = cases.filter((c) => c.parseOnly);
    expect(po).toHaveLength(8);
    for (const c of po) expect(c.parseOnly!.length, c.utterance).toBeGreaterThan(30);
    for (const c of NEW_COMMAND_CASES) {
      const got = cases.find((x) => x.utterance === c.say)!;
      if (c.refuses) expect(got.parseOnly).toBe(refusalReason(c.refuses));
    }
    const sub = NEW_COMMAND_CASES.filter((c) => c.parseOnly);
    expect(sub.map((c) => c.say)).toEqual(["move everything in sub-lane Sub 1 one step to the right"]);
    const subLanes = world.filter((e) => e.type === "sublane"
      || (e.type === "lane" && world.find((p) => p.id === e.parentId)?.type !== "pool"));
    expect(subLanes, "the test diagram really has no sub-lane").toEqual([]);
  });

  it("every selection is an element of the test diagram", () => {
    for (const c of cases) for (const id of c.needsSelection ?? []) expect(world.some((e) => e.id === id), `${c.utterance}: ${id}`).toBe(true);
  });
});

describe("T4972 — Replay handles the set like the popup set", () => {
  it("names it, orders it after the popup set, and gives each clip its case's context and today's key", () => {
    const sets = [
      { seed: NEW_COMMANDS_SET_ID, clips: 50, lastRecordedAt: "2026-09-27T00:00:00Z" },
      { seed: CATALOG_SET_ID, clips: 110, lastRecordedAt: "2026-09-26T00:00:00Z" },
      { seed: DEFAULT_CORPUS_SEED, clips: 100, lastRecordedAt: "2026-09-25T00:00:00Z" },
    ];
    expect(orderReplaySets(sets).map((s) => s.seed)).toEqual([DEFAULT_CORPUS_SEED, CATALOG_SET_ID, NEW_COMMANDS_SET_ID]);
    expect(replaySetLabel(sets[0])).toBe("New commands: dividers, convert, contents (50) — 50 clips");
    const replay = read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx");
    expect(replay, "any fixed set's context, not the popup set's only")
      .toContain('corpusSet(runLabel.seed)?.kind === "catalog" ? casesForSet(runLabel.seed, { count: 0, world: els }) : []');
    expect(replay).toContain("const ctx = popupContext.get(clip.caseId);");
    expect(replay, "a hand-written key is today's key for the same sentence").toContain("ctx && ctx.utterance === clip.utterance ? ctx.ops : recordedOps");
  });
});
