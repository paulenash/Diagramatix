/**
 * Named voice test SETS, and the "Commands popup: every line" set.
 *
 * Paul, 2026-09-26: "Construct a new set of generated commands for Voice
 * testing the goes through the Commands listed in the Commands popup … Add this
 * set to the drop-down list of seeds so that I can then investigate this set.
 * Is that how this feature should work? Currently the Seed value is
 * "dgx-voice-2026-09-realistic" but there does not appear to be a way to create
 * other sets of commands?" — a seed only reshuffles one generator; a set is a
 * different exam.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CORPUS_SETS, CUSTOM_SET, corpusSet, casesForSet, familiesForSet, resumeAt, isRecorded } from "@/app/lib/assist/corpusSets";
import {
  CATALOG_SET_ID, CATALOG_NOT_RECORDED, CATALOG_CONTEXT, catalogLines, catalogCases, catalogCaseId,
  notRecordedReason, expectedOpsFor,
} from "@/app/lib/assist/catalogCorpus";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { generateCases, FAMILY_NAMES } from "@/app/lib/assist/commandGenerator";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { scoreCase } from "@/app/lib/assist/commandScore";
import { fixtureElements } from "@/app/lib/assist/commandFixture";
import { DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { orderReplaySets, replaySetLabel, type RecordedSet } from "@/app/lib/dictation/replaySets";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const world = fixtureElements();

describe("T4923 — the set registry", () => {
  it("lists the realistic sample and the popup set, each explaining itself", () => {
    expect(CORPUS_SETS.map((s) => s.id)).toEqual([DEFAULT_CORPUS_SEED, CATALOG_SET_ID]);
    for (const s of CORPUS_SETS) {
      expect(s.label.length, s.id).toBeGreaterThan(5);
      expect(s.explain.length, `${s.id} says what it is for`).toBeGreaterThan(60);
    }
    expect(new Set(CORPUS_SETS.map((s) => s.id)).size).toBe(CORPUS_SETS.length);
    expect(corpusSet(CUSTOM_SET)).toBeUndefined();
  });

  it("a generated set (or a custom seed) is the generator; the popup set is every line", () => {
    const a = casesForSet(DEFAULT_CORPUS_SEED, { count: 30, world });
    expect(a).toEqual(generateCases({ seed: DEFAULT_CORPUS_SEED, count: 30, world }));
    expect(casesForSet("my own seed", { count: 10, world })).toEqual(generateCases({ seed: "my own seed", count: 10, world }));
    expect(casesForSet(CATALOG_SET_ID, { count: 3, world })).toEqual(catalogCases());
    expect(familiesForSet(DEFAULT_CORPUS_SEED, FAMILY_NAMES)).toEqual([...FAMILY_NAMES]);
    expect(familiesForSet(CATALOG_SET_ID, FAMILY_NAMES)).toEqual(COMMAND_CATALOG.map((f) => f.family).filter((f) => catalogCases().some((c) => c.family === f)));
  });
});

describe("T4924 — the popup set IS the popup", () => {
  it("every popup line is a case, or is left out with a written reason", () => {
    const cases = new Set(catalogCases().map((c) => c.utterance));
    for (const l of catalogLines()) {
      const why = notRecordedReason(l.say);
      if (cases.has(l.say)) expect(why, l.say).toBeNull();
      else expect((why ?? "").length, `“${l.say}” is missing from the set with no reason`).toBeGreaterThan(20);
    }
    for (const say of Object.keys(CATALOG_NOT_RECORDED)) {
      expect(catalogLines().some((l) => l.say === say), `stale exclusion “${say}”`).toBe(true);
    }
    for (const say of Object.keys(CATALOG_CONTEXT)) {
      expect(catalogLines().some((l) => l.say === say), `stale context “${say}”`).toBe(true);
    }
  });

  it("in the popup's order, with ids from the words — an inserted line moves no other id", () => {
    const lines = catalogLines().map((l) => l.say);
    const order = catalogCases().map((c) => lines.indexOf(c.utterance));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    const ids = catalogCases().map((c) => c.id);
    expect(new Set(ids).size, "no two lines share an id").toBe(ids.length);
    expect(catalogCaseId("compress the Customer pool")).toBe(`${CATALOG_SET_ID}#compress-the-customer-pool`);
  });

  it("the answer key is FROZEN — a line that starts parsing differently is seen and judged", async () => {
    // Regenerate after reviewing a grammar change:  npx vitest run tests/dictation/voice-test-sets.test.ts -u
    const now: Record<string, unknown> = {};
    for (const c of catalogLines()) if (notRecordedReason(c.say) === null) now[c.say] = parseCommand(c.say);
    await expect(`${JSON.stringify(now, null, 2)}\n`).toMatchFileSnapshot("../../app/lib/assist/catalogCorpus.expected.json");
    for (const c of catalogCases()) expect(c.ops, c.utterance).toEqual(expectedOpsFor(c.utterance) ?? []);
  });

  it("a parse-only line is judged on its parse alone", () => {
    const c = { id: "x#1", family: "f", utterance: "take the second one", ops: parseCommand("take the second one") ?? [], refs: {}, parseOnly: "needs a ghost suggestion on screen" };
    const r = scoreCase(c, undefined, world);
    expect(r.outcome).toBe("pass");
    expect(r.detail).toContain("parse only");
  });
});

describe("T4926 — the card speaks the test diagram's names (Paul's Q3, 2026-09-26)", () => {
  it("every line that is not parse-only resolves, with its context, to the test diagram — no stale, no ambiguous, no wrong element", () => {
    const bad: string[] = [];
    for (const c of catalogCases()) {
      if (c.parseOnly) continue;
      const r = scoreCase(c, undefined, world);
      if (r.outcome !== "pass") bad.push(`${r.outcome}: “${c.utterance}” — ${r.detail}`);
    }
    expect(bad).toEqual([]);
  });

  it("the popup's selection example “the selected event” names any event (found by this set)", () => {
    for (const id of ["start", "loose", "end"]) {
      const c = { id: "e#1", family: "f", utterance: "make the selected event a timer event", ops: parseCommand("make the selected event a timer event") ?? [], refs: {}, needsSelection: [id] };
      expect(scoreCase(c, undefined, world).outcome, id).toBe("pass");
    }
  });

  it("a line that needs what the harness cannot supply says why, and nothing else is parse-only", () => {
    for (const [say, ctx] of Object.entries(CATALOG_CONTEXT)) {
      if (ctx.parseOnly) expect(ctx.parseOnly.length, say).toBeGreaterThan(30);
      if (ctx.needsSelection) for (const id of ctx.needsSelection) expect(world.some((e) => e.id === id), `${say}: ${id}`).toBe(true);
    }
  });
});

describe("T4925 — recording resumes, Replay lists sets by name", () => {
  const cases = catalogCases().slice(0, 4);

  it("resumes at the first case, in the set's own order, with no clip of its id AND sentence", () => {
    expect(resumeAt(cases, [])).toBe(0);
    const rec = [{ caseId: cases[0].id, utterance: cases[0].utterance }, { caseId: cases[2].id, utterance: cases[2].utterance }];
    expect(resumeAt(cases, rec)).toBe(1);
    expect(isRecorded(cases[1], [{ caseId: cases[1].id, utterance: "a reworded line" }]), "a reworded line is a new case").toBe(false);
    expect(resumeAt(cases, cases.map((c) => ({ caseId: c.id, utterance: c.utterance })))).toBe(cases.length);
  });

  it("Replay names registry sets and labels everything else as an older recording", () => {
    const sets: RecordedSet[] = [
      { seed: "dgx-voice-2026-09", clips: 100, lastRecordedAt: "2026-09-20T00:00:00Z" },
      { seed: CATALOG_SET_ID, clips: 110, lastRecordedAt: "2026-09-26T00:00:00Z" },
      { seed: DEFAULT_CORPUS_SEED, clips: 100, lastRecordedAt: "2026-09-25T00:00:00Z" },
    ];
    expect(orderReplaySets(sets).map((s) => s.seed)).toEqual([DEFAULT_CORPUS_SEED, CATALOG_SET_ID, "dgx-voice-2026-09"]);
    expect(replaySetLabel(sets[1])).toBe("Commands popup: every line — 110 clips");
    expect(replaySetLabel(sets[0])).toBe("Older recording: dgx-voice-2026-09 (replay only) — 100 clips");
  });

  it("wiring: the three tabs read the one registry; the generator never sees the popup set", () => {
    const test = read("app/(dashboard)/dashboard/admin/voice-assist-test/VoiceAssistTestClient.tsx");
    expect(test).toContain("casesForSet(seed");
    expect(test).toContain("CORPUS_SETS.map");
    const recorder = read("app/(dashboard)/dashboard/admin/voice-assist-test/RecorderPanel.tsx");
    expect(recorder).toContain("casesForSet(seed");
    expect(recorder).toContain("resumeAt(cases, recorded)");
    expect(recorder).toContain('fd.append("corpusSeed", seed)');
    const replay = read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx");
    expect(replay).toContain("orderReplaySets(");
    expect(replay).toContain("replaySetLabel(s)");
    expect(replay, "the popup set is scored against today's parse of the sentence").toContain("parseCommand(clip.utterance)");
    const gen = read("app/lib/assist/commandGenerator.ts");
    expect(gen).not.toMatch(/catalogCorpus|corpusSets/);
  });
});
