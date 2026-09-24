/**
 * T4724–T4729 — the generated command corpus, and the scorer that reads it.
 *
 * Paul, 2026-09-24: "a generation feature that generates voice commands for
 * testing and then checks what the response is and determines whether the voice
 * command worked correctly or not inside a test suite."
 *
 * Cases are built FROM THE OPS OUTWARD — pick an op shape, fill it from the
 * fixture, render it to English — so the expected answer exists by construction
 * and nobody labels a hundred sentences by hand. `parseCommand(render(op))` is
 * then a genuine two-implementation agreement check, which is worth exactly as
 * much as the independence of the two implementations, and no more. Hence
 * T4726.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  generateCases, GENERATOR_FAMILIES, NOT_GENERATED, FAMILY_NAMES, worldOf,
} from "@/app/lib/assist/commandGenerator";
import { scoreCase, summarise, isFailure } from "@/app/lib/assist/commandScore";
import { fixtureElements, FRESH_LABELS } from "@/app/lib/assist/commandFixture";
import { makeRng, seedFrom, pick, int, shuffled, DEFAULT_CORPUS_SEED } from "@/app/lib/assist/rng";
import { resolveRef } from "@/app/lib/assist/resolveRef";

const world = () => fixtureElements();

describe("T4724 — the corpus is the same corpus every time", () => {
  it("one seed, one set of cases", () => {
    // A red case nobody can reach again is a red case nobody can fix.
    const a = generateCases({ seed: "fixed", count: 60, world: world() });
    const b = generateCases({ seed: "fixed", count: 60, world: world() });
    expect(a).toEqual(b);
    const c = generateCases({ seed: "different", count: 60, world: world() });
    expect(c.map((x) => x.utterance)).not.toEqual(a.map((x) => x.utterance));
  });

  it("the RNG is a real one, not a counter", () => {
    const rng = makeRng("s");
    const xs = Array.from({ length: 500 }, () => rng.next());
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
    expect(new Set(xs).size, "no obvious cycle over 500 draws").toBeGreaterThan(450);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.4);
    expect(mean).toBeLessThan(0.6);
    expect(seedFrom("a")).not.toBe(seedFrom("b"));
    expect(int(makeRng(1), 5, 5), "a degenerate range is not an error").toBe(5);
    expect(shuffled(makeRng(2), [1, 2, 3, 4]).sort()).toEqual([1, 2, 3, 4]);
    expect(() => pick(makeRng(3), []), "an empty pick is a bug, not a silent undefined").toThrow();
  });

  it("every case it emits names something that is really there", () => {
    // A case whose ref resolves to nothing would fail for a reason that has
    // nothing to do with the grammar, and would be indistinguishable from one
    // that mattered.
    const els = world();
    for (const c of generateCases({ count: 300, world: els })) {
      for (const [spoken, wantId] of Object.entries(c.refs)) {
        const r = resolveRef(spoken, els);
        expect(r, `“${spoken}” (case ${c.id}) resolves to nothing`).toBeTruthy();
        expect(r && "id" in r ? r.id : null, `“${spoken}” resolves to the wrong element`).toBe(wantId);
      }
      expect(c.utterance.trim().length, `case ${c.id} is empty`).toBeGreaterThan(0);
      expect(c.ops.length, `case ${c.id} expects no ops`).toBeGreaterThan(0);
    }
  });

  it("asks for a count and returns it, and a narrow fixture cannot spin it", () => {
    expect(generateCases({ count: 25, world: world() })).toHaveLength(25);
    expect(generateCases({ count: 10, world: world(), families: ["connect"] })).toHaveLength(10);
    // A world with nothing in it: every template is inapplicable, so it must
    // return empty rather than loop looking for one that fits.
    expect(generateCases({ count: 10, world: [] }).length).toBeLessThanOrEqual(10);
  });

  it("the fixture carries the names this feature has been caught by", () => {
    const labels = world().map((e) => e.label);
    expect(labels, "a name ending in a digit — 'lane two' and the lane:3 boost").toContain("Lane 2");
    expect(labels, "the sub-lane naming Paul asked for").toContain("Sub 1");
    expect(labels, "a bare common word that is also a verb").toContain("Review");
    expect(labels, "a two-word proper noun starting with a verb").toContain("Pick Items");
    expect(labels, "homophone-adjacent and under MIN_KEY_FOR_FUZZ").toContain("Sales");
    // And nothing the generator hands out as a NEW name may already be on it.
    for (const fresh of FRESH_LABELS) expect(labels).not.toContain(fresh);
  });
});

describe("T4725 — every op kind is generated, or consciously excluded", () => {
  it("a new op in ops.ts fails this until somebody decides", () => {
    // The same discipline tests/backup/coverage.test.ts applies to new tables:
    // the failure is not "you forgot", it is "make a choice".
    const src = readFileSync("app/lib/assist/ops.ts", "utf8");
    const union = src.slice(src.indexOf("export type AssistOp ="), src.indexOf("// ── Spoken vocabulary"));
    const kinds = [...new Set([...union.matchAll(/\{\s*op:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]))];
    expect(kinds.length, "the union was found and parsed").toBeGreaterThan(25);

    const generated = new Set<string>();
    for (const c of generateCases({ count: 800, world: world() })) {
      for (const op of c.ops) generated.add(op.op);
    }
    const unaccounted = kinds.filter((k) => !generated.has(k) && !(k in NOT_GENERATED));
    expect(unaccounted, "generate these, or add them to NOT_GENERATED with a reason").toEqual([]);

    // …and the exclusion list may not go stale either.
    const nowGenerated = Object.keys(NOT_GENERATED).filter((k) => generated.has(k));
    expect(nowGenerated, "these are generated now — take them off NOT_GENERATED").toEqual([]);
    const gone = Object.keys(NOT_GENERATED).filter((k) => !kinds.includes(k));
    expect(gone, "these ops no longer exist — take them off NOT_GENERATED").toEqual([]);
  });

  it("every exclusion carries a reason, not a shrug", () => {
    for (const [op, why] of Object.entries(NOT_GENERATED)) {
      expect(why.length, `${op} needs a real reason`).toBeGreaterThan(20);
    }
  });

  it("every family declares itself applicable against the fixture", () => {
    const w = worldOf(world());
    const usable = GENERATOR_FAMILIES.filter((t) => t.applicable(w));
    expect(usable.length, "the fixture suits every family").toBe(GENERATOR_FAMILIES.length);
    expect(new Set(FAMILY_NAMES).size, "family names are unique").toBe(FAMILY_NAMES.length);
  });
});

describe("T4726 — the generator is independent of the grammar", () => {
  it("does not import commandGrammar, in any form", () => {
    // THE load-bearing test in this file. If the renderer were built from the
    // parser, parseCommand(render(op)) === op would be a tautology and the
    // corpus would prove nothing at all. Source-level, because that is the only
    // way to assert an absence.
    // Comments are stripped first: the module's own docblock explains this very
    // rule and therefore names the file it must not import. Checking raw text
    // would make a module fail for documenting itself.
    const code = (f: string) => readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    const src = readFileSync("app/lib/assist/commandGenerator.ts", "utf8");
    const imports = [...src.matchAll(/^\s*import[^;]*from\s+"([^"]+)"/gm)].map((m) => m[1]);
    expect(imports, "never the parser").not.toContain("./commandGrammar");
    expect(code("app/lib/assist/commandGenerator.ts")).not.toMatch(/commandGrammar/);
    expect(code("app/lib/assist/commandGenerator.ts"), "nor anything that re-exports it")
      .not.toMatch(/parseCommand/);
    // It MAY take the shared vocabulary — a noun list is not a parser.
    expect(imports, "the op union is shared on purpose").toContain("./ops");

    // And the docblock must keep saying WHY, or the next person deletes the rule.
    expect(src, "the reason is the thing that survives").toMatch(/tautolog/i);
  });

  it("the fixture and the RNG are independent too", () => {
    const code = (f: string) => readFileSync(f, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    for (const f of ["app/lib/assist/commandFixture.ts", "app/lib/assist/rng.ts"]) {
      expect(code(f)).not.toMatch(/commandGrammar|parseCommand/);
    }
  });
});

describe("T4727 — the round trip, with its disagreements frozen", () => {
  /**
   * Where the generator and the grammar do not agree, keyed by family and
   * outcome so it survives the corpus being reshuffled.
   *
   * THIS LIST IS THE POINT OF THE TEST. An honest generator emits sentences the
   * grammar refuses, and a permanently-red test gets deleted in week two —
   * `mutating-route-guard.test.ts` says as much in its own docblock. So this is
   * a ratchet instead, failing BOTH ways: a new kind of disagreement fails, and
   * a listed one that starts agreeing also fails, so the list cannot go stale.
   *
   * Each line is a work queue item, not a defect being tolerated.
   */
  const KNOWN_DISAGREEMENTS: Record<string, string> = {
    "wrapInPool|misparsed":
      "The WHOLE-DIAGRAM wrap drops its label: “put a pool around everything called Finance” "
      + "and “wrap everything in a pool called Finance” both parse to a bare wrapInPool, so the pool "
      + "is created unnamed and the user has to rename it. The SELECTION wrap keeps it — "
      + "“wrap these in a pool called Finance” → wrapInContainer{label}. Narrow, real, and a "
      + "one-line grammar fix; the original review listed a label on wrap-in-pool as something "
      + "only the AI fallback supplied.",
  };

  /** A fixed seed and count, so the failure set is reproducible by anyone. */
  const CORPUS = { seed: DEFAULT_CORPUS_SEED, count: 600 };
  /** Headroom over the frozen kinds, so a regression inside a listed family still shows. */
  const MAX_FAILURES = 40;

  const run = () => {
    const els = world();
    const results = generateCases({ ...CORPUS, world: els }).map((c) => scoreCase(c, undefined, els));
    return { results, summary: summarise(results) };
  };

  it("nothing disagrees except what is written down", () => {
    const { results } = run();
    const kinds = new Set(results.filter((r) => isFailure(r.outcome)).map((r) => `${r.family}|${r.outcome}`));
    const surprises = [...kinds].filter((k) => !(k in KNOWN_DISAGREEMENTS));
    expect(surprises, "new disagreement(s) — fix the grammar, fix the renderer, or write down why")
      .toEqual([]);
  });

  it("and everything written down still disagrees", () => {
    const { results } = run();
    const kinds = new Set(results.filter((r) => isFailure(r.outcome)).map((r) => `${r.family}|${r.outcome}`));
    const fixed = Object.keys(KNOWN_DISAGREEMENTS).filter((k) => !kinds.has(k));
    expect(fixed, "these agree now — delete them from KNOWN_DISAGREEMENTS").toEqual([]);
  });

  it("the failure count stays under its ceiling", () => {
    // The kinds list cannot see a regression that adds more failures of a kind
    // already listed. This can.
    const { summary } = run();
    expect(summary.failed, `${summary.failed} of ${summary.total} failed`).toBeLessThanOrEqual(MAX_FAILURES);
    expect(summary.total).toBe(CORPUS.count);
  });

  it("reports the fallback rate — what the AI is actually for", () => {
    // Every utterance the deterministic grammar refuses costs a metered call.
    // If this is near zero the AI fallback is carrying almost nothing.
    const { summary } = run();
    expect(summary.fallbackRate).toBeGreaterThanOrEqual(0);
    expect(summary.fallbackRate).toBeLessThan(0.2);
  });
});

describe("T4728 — the scorer names the layer, not just the failure", () => {
  const els = world();
  const one = (utterance: string, ops: Parameters<typeof scoreCase>[0]["ops"], refs: Record<string, string> = {}) =>
    ({ id: "x#1", family: "test", utterance, ops, refs });

  it("words wrong but the answer right is NOT a failure", () => {
    // The single most misleading way to score the audio leg. Counting these as
    // failures makes the recogniser look far worse than it is and hides the
    // mis-hears that actually cost something.
    const c = one("delete Review", [{ op: "delete", ref: "Review" }], { Review: "t1" });
    const r = scoreCase(c, "Delete review.", els);
    expect(r.outcome).toBe("pass-despite-mishear");
    expect(r.textDiffered).toBe(true);
    expect(isFailure(r.outcome)).toBe(false);
  });

  it("refused, and the words were right → the GRAMMAR", () => {
    const c = one("frobnicate the widget", [{ op: "clear" }]);
    const r = scoreCase(c, undefined, els);
    expect(r.outcome).toBe("unparsed");
    expect(r.detail, "and it says what live would do with it").toContain("AI");
  });

  it("refused, and the words were wrong → the RECOGNISER", () => {
    const c = one("delete Review", [{ op: "delete", ref: "Review" }], { Review: "t1" });
    // Note the transcript has to be something the grammar genuinely refuses.
    // "delete the frobnicator" PARSES — delete takes any ref — and scores
    // wrong-element, which is the correct answer and a different test.
    expect(scoreCase(c, "the frobnicator wobbles gently", els).outcome).toBe("misheard");
  });

  it("parsed into the wrong shape, and says which field", () => {
    const c = one("delete Review", [{ op: "delete", ref: "Review", compact: true }], { Review: "t1" });
    const r = scoreCase(c, undefined, els);
    expect(r.outcome).toBe("misparsed");
    expect(r.detail, "the reader must not have to diff two JSON blobs by eye").toContain("compact");
  });

  it("right shape, wrong element → the REFERENCE, not the grammar", () => {
    const c = one("delete Review", [{ op: "delete", ref: "Pick Items" }], {});
    const r = scoreCase(c, undefined, els);
    expect(r.outcome).toBe("wrong-element");
    expect(r.detail).toContain("wanted");
  });

  it("refs compare by what they RESOLVE to, never by their text", () => {
    // "the gateway" and "Approved?" are the same element. A scorer comparing
    // strings would report a red row for a command that worked perfectly.
    const c = one("rename the gateway to Checked", [{ op: "rename", ref: "Approved?", label: "Checked" }], {});
    expect(scoreCase(c, undefined, els).outcome).toBe("pass");
  });

  it("a mis-hear beats a mis-parse: first failing layer wins", () => {
    // If the recogniser mangled the sentence, the parser's opinion of the
    // mangled text is not a finding.
    const c = one("delete Review", [{ op: "delete", ref: "Review" }], { Review: "t1" });
    const r = scoreCase(c, "rename Review to Sales", els);
    expect(r.outcome, "not 'misparsed'").toBe("misheard");
  });

  it("summarises by family and counts the fallback rate", () => {
    const s = summarise([
      { caseId: "1", family: "add", outcome: "pass", heard: "", expected: [], actual: [], textDiffered: false, detail: "" },
      { caseId: "2", family: "add", outcome: "unparsed", heard: "", expected: [], actual: null, textDiffered: false, detail: "" },
      { caseId: "3", family: "move", outcome: "pass-despite-mishear", heard: "", expected: [], actual: [], textDiffered: true, detail: "" },
    ]);
    expect(s.total).toBe(3);
    expect(s.passed, "pass-despite-mishear counts as a pass").toBe(2);
    expect(s.byFamily.add).toEqual({ total: 2, passed: 1, failed: 1 });
    expect(s.fallbackRate).toBeCloseTo(1 / 3, 5);
  });
});

describe("T4729 — one scorer, two legs", () => {
  it("the text leg and a perfect transcript agree on every case", () => {
    // This is "one rule, one place" applied to the MEASUREMENT. If the two legs
    // ever diverged, the cheap corpus and the expensive recorded one could not
    // be compared, which is the whole reason for recording anything.
    const els = world();
    for (const c of generateCases({ seed: "legs", count: 200, world: els })) {
      const text = scoreCase(c, undefined, els);
      const audio = scoreCase(c, c.utterance, els);
      expect(audio.outcome, `case ${c.id}: "${c.utterance}"`).toBe(text.outcome);
    }
  });

  it("a perfect transcript is not reported as a mis-hear", () => {
    const els = world();
    const c = generateCases({ seed: "legs", count: 1, world: els })[0];
    // Same words, different capitalisation and punctuation — which is exactly
    // what a recogniser returns.
    const r = scoreCase(c, `${c.utterance.toUpperCase()}.`, els);
    expect(r.textDiffered, "trailing punctuation is a difference").toBe(true);
    expect(["pass", "pass-despite-mishear"]).toContain(r.outcome);
  });
});

describe("T4729b — the tile, and what it is allowed to cost", () => {
  const read = (p: string) => readFileSync(p, "utf8");

  it("the text leg runs in the browser — no route, no server, no cost", () => {
    // The generator, the scorer and the grammar are all pure, so a thousand
    // cases are a second of somebody's laptop and nothing else. Routing it
    // through the server would buy nothing and cost a deploy.
    const client = read("app/(dashboard)/dashboard/admin/voice-assist-test/VoiceAssistTestClient.tsx");
    expect(client).toContain('from "@/app/lib/assist/commandGenerator"');
    expect(client).toContain('from "@/app/lib/assist/commandScore"');
    const fetches = [...client.matchAll(/fetch\("([^"]+)"/g)].map((m) => m[1]);
    expect(fetches, "the ONLY call it makes is the per-row investigate")
      .toEqual(["/api/admin/voice-assist-test/investigate"]);
  });

  it("investigate is per-row and guarded", () => {
    const route = read("app/api/admin/voice-assist-test/investigate/route.ts");
    expect(route).toContain("isSuperuser(session)");
    expect(route, "a mutating route must block read-only impersonation").toContain("blockReadOnlyImpersonation(session)");
    expect(route, "billed like the AI fallback it debugs, not like a generation")
      .toContain("getAiCommandModel()");
    expect(route, "no key configured is a state, not a crash").toContain("No AI key is configured");
  });

  it("the tile exists and the page re-guards itself", () => {
    expect(read("app/(dashboard)/dashboard/admin/AdminClient.tsx")).toContain('href: "/dashboard/admin/voice-assist-test"');
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-test/page.tsx")).toContain("isActingSuperuser(session)");
  });
});
