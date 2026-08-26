import { describe, it, expect } from "vitest";
import {
  score, decode, encode, allFeedbacks, feedbackKey, feedbackFromKey, fullSet,
  filterConsistent, statsFor, analyse, openingPatterns, totalCodes, totalBits,
  positionFrequencies, isValidConfig, randomSecret, sameCode, codeLabel, PEGS,
  MIN_COLOURS, MAX_COLOURS, MIN_LENGTH, MAX_LENGTH,
  type Config, type Code,
} from "@/app/lib/games/mastermind";

const CLASSIC: Config = { colours: 6, length: 4 };

/**
 * T2885 — the scoring rule, which everything else is built on.
 *
 * Black is easy and white is where implementations go wrong: the min-of-counts
 * rule is what makes repeated colours behave. Three reds against one red is ONE
 * match, not three, and getting that wrong produces a game that looks right until
 * a repeat appears and then quietly filters out the real code.
 */
describe("Mastermind — scoring", () => {
  it("counts exact matches as black and displaced ones as white", () => {
    expect(score([0, 1, 2, 3], [0, 1, 2, 3], 6)).toEqual({ black: 4, white: 0 });
    expect(score([0, 1, 2, 3], [3, 2, 1, 0], 6)).toEqual({ black: 0, white: 4 });
    expect(score([0, 1, 2, 3], [0, 1, 3, 2], 6)).toEqual({ black: 2, white: 2 });
    expect(score([0, 1, 2, 3], [4, 5, 4, 5], 6)).toEqual({ black: 0, white: 0 });
  });

  it("a repeated colour matches only as often as it appears in both", () => {
    // Three reds guessed against one red in the code: one match, and it is exact.
    expect(score([0, 0, 0, 1], [0, 2, 3, 4], 6)).toEqual({ black: 1, white: 0 });
    // One red guessed against three: still one — and once that red is matched
    // exactly, nothing is left over to be displaced.
    expect(score([1, 0, 2, 3], [0, 0, 0, 4], 6)).toEqual({ black: 1, white: 0 });
    // Move the guess's red off the code's red and the same single match is white.
    expect(score([0, 1, 2, 3], [4, 0, 0, 0], 6)).toEqual({ black: 0, white: 1 });
    expect(score([0, 0, 1, 1], [1, 1, 0, 0], 6)).toEqual({ black: 0, white: 4 });
  });

  it("is symmetric, and never returns more pegs than the code is long", () => {
    // Every 20th pair across the whole 6×4 space — 1.68M pairs in full, which is
    // more than this needs to catch an asymmetry.
    let pairs = 0;
    for (let a = 0; a < 1296; a += 7) {
      for (let b = 0; b < 1296; b += 3) {
        const A = decode(a, CLASSIC), B = decode(b, CLASSIC);
        const x = score(A, B, 6), y = score(B, A, 6);
        expect(x, `${codeLabel(A)} vs ${codeLabel(B)}`).toEqual(y);
        expect(x.black + x.white).toBeLessThanOrEqual(4);
        pairs++;
      }
    }
    expect(pairs).toBeGreaterThan(80_000);
  });

  it("never produces the one answer no setter can give", () => {
    // length−1 exact and one displaced is impossible: the odd peg has only its
    // own position left to sit in. So 4 pegs have 14 answers, not 15.
    expect(allFeedbacks(4)).toHaveLength(14);
    expect(allFeedbacks(4).some((f) => f.black === 3 && f.white === 1)).toBe(false);
    const seen = new Set<string>();
    for (let a = 0; a < 1296; a++) {
      for (let b = 0; b < 1296; b += 11) {
        const f = score(decode(a, CLASSIC), decode(b, CLASSIC), 6);
        seen.add(`${f.black},${f.white}`);
      }
    }
    expect(seen.has("3,1"), "a real game must never produce 3 black 1 white").toBe(false);
    expect(seen.size).toBe(14);
  });

  it("packs a feedback into a key and back again", () => {
    for (const n of [3, 4, 5, 6]) {
      for (const f of allFeedbacks(n)) expect(feedbackFromKey(feedbackKey(f, n), n)).toEqual(f);
    }
  });
});

/**
 * T2886 — codes, indices and configuration.
 *
 * Every candidate is carried as an integer, so a broken round trip would not
 * throw; it would silently analyse the wrong codes.
 */
describe("Mastermind — codes and configuration", () => {
  it("round-trips every code of a mid-sized configuration", () => {
    const cfg: Config = { colours: 7, length: 5 };
    for (let i = 0; i < totalCodes(cfg); i++) expect(encode(decode(i, cfg), cfg)).toBe(i);
  });

  it("puts digit 0 on the left, so reading and writing agree", () => {
    expect(decode(1, CLASSIC)).toEqual([0, 0, 0, 1]);
    expect(decode(6, CLASSIC)).toEqual([0, 0, 1, 0]);
    expect(encode([1, 0, 0, 0], CLASSIC)).toBe(216);
  });

  it("has a peg colour for every configuration it allows", () => {
    expect(PEGS.length).toBeGreaterThanOrEqual(MAX_COLOURS);
    expect(new Set(PEGS.map((p) => p.short)).size).toBe(PEGS.length);
    expect(new Set(PEGS.map((p) => p.hex)).size).toBe(PEGS.length);
  });

  it("accepts exactly the configurations the setter is offered", () => {
    expect(isValidConfig({ colours: MIN_COLOURS, length: MIN_LENGTH })).toBe(true);
    expect(isValidConfig({ colours: MAX_COLOURS, length: MAX_LENGTH })).toBe(true);
    expect(isValidConfig({ colours: MIN_COLOURS - 1, length: 4 })).toBe(false);
    expect(isValidConfig({ colours: MAX_COLOURS + 1, length: 4 })).toBe(false);
    expect(isValidConfig({ colours: 6, length: MIN_LENGTH - 1 })).toBe(false);
    expect(isValidConfig({ colours: 6, length: MAX_LENGTH + 1 })).toBe(false);
  });

  it("sizes the space as colours^length, and the bits as log2 of it", () => {
    expect(totalCodes(CLASSIC)).toBe(1296);
    expect(totalCodes({ colours: 10, length: 6 })).toBe(1_000_000);
    expect(totalBits(CLASSIC)).toBeCloseTo(Math.log2(1296), 10);
    expect(fullSet(CLASSIC)).toHaveLength(1296);
  });

  it("only ever generates a legal secret", () => {
    const cfg: Config = { colours: 8, length: 5 };
    for (let i = 0; i < 200; i++) {
      const s = randomSecret(cfg);
      expect(s).toHaveLength(5);
      for (const d of s) expect(d).toBeGreaterThanOrEqual(0);
      for (const d of s) expect(d).toBeLessThan(8);
    }
    expect(sameCode([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(sameCode([1, 2, 3], [1, 2, 4])).toBe(false);
  });
});

/**
 * T2887 — the opening shortcut, which is the one real optimisation in the engine.
 *
 * The claim: before any answer is known, two guesses of the same SHAPE (the same
 * pattern of repeated colours) split the space identically, because the full set
 * of codes survives both renaming the colours and reordering the positions. If
 * that is true, the opening ranking needs a handful of representatives instead of
 * a million guesses. If it is false, the tile confidently recommends the wrong
 * opening on every large board — which is why it is checked rather than argued.
 */
describe("Mastermind — the opening shortcut", () => {
  it("lists one representative per shape, and no more", () => {
    // Integer partitions of the length, capped at the number of colours.
    expect(openingPatterns(CLASSIC).map(codeLabel)).toEqual([
      "R R R R", "R R R B", "R R B B", "R R B G", "R B G Y",
    ]);
    expect(openingPatterns({ colours: 10, length: 6 })).toHaveLength(11);
    expect(openingPatterns({ colours: 6, length: 3 })).toHaveLength(3);
    // The colour cap never actually binds here, and it is worth knowing why:
    // the setter is never offered fewer colours than pegs (6..10 colours, 3..6
    // pegs), so a partition can never ask for more colours than exist. The cap
    // stays in the code because it is what makes the function correct in
    // general, not because any allowed configuration exercises it.
    const unrestricted = (n: number): number => {
      const ways = new Array<number>(n + 1).fill(0);
      ways[0] = 1;
      for (let part = 1; part <= n; part++) for (let v = part; v <= n; v++) ways[v] += ways[v - part];
      return ways[n];
    };
    for (let colours = MIN_COLOURS; colours <= MAX_COLOURS; colours++) {
      for (let length = MIN_LENGTH; length <= MAX_LENGTH; length++) {
        expect(openingPatterns({ colours, length }), `${colours}x${length}`)
          .toHaveLength(unrestricted(length));
      }
    }
    // Cap a shorter code at 2 colours and it does bind: 4 pegs give 4+0... no,
    // only the partitions with at most two parts survive.
    expect(openingPatterns({ colours: 2, length: 4 }).map(codeLabel)).toEqual(["R R R R", "R R R B", "R R B B"]);
  });

  it("every guess of the same shape splits the full space identically", () => {
    const all = fullSet(CLASSIC);
    /** The shape of a code: its colour multiplicities, largest first. */
    const shapeOf = (c: Code): string => {
      const counts = new Map<number, number>();
      for (const d of c) counts.set(d, (counts.get(d) ?? 0) + 1);
      return [...counts.values()].sort((a, z) => z - a).join(",");
    };
    const byShape = new Map<string, { entropy: number; worst: number; label: string }>();
    // Every 13th code: enough to see all five shapes many times over.
    for (let i = 0; i < 1296; i += 13) {
      const code = decode(i, CLASSIC);
      const shape = shapeOf(code);
      const s = statsFor(code, all, CLASSIC);
      const seen = byShape.get(shape);
      if (!seen) { byShape.set(shape, { entropy: s.entropyBits, worst: s.worstCase, label: codeLabel(code) }); continue; }
      expect(s.entropyBits, `${codeLabel(code)} vs ${seen.label} — same shape ${shape}`).toBeCloseTo(seen.entropy, 12);
      expect(s.worstCase, `${codeLabel(code)} vs ${seen.label}`).toBe(seen.worst);
    }
    expect(byShape.size, "all five 4-peg shapes must have been seen").toBe(5);
  });

  it("uses the shortcut for the opening and reports the ranking as exact", () => {
    const a = analyse(fullSet(CLASSIC), CLASSIC, true);
    expect(a.openingShortcut).toBe(true);
    expect(a.estimated).toBe(false);
    expect(a.poolSize).toBe(5);
    expect(a.sampleSize).toBe(1296);
  });
});

/**
 * T2888 — filtering, the operation the whole game rests on.
 *
 * If the real code is ever filtered out, the tile leads the player confidently
 * into a position with no answer. That is the failure worth guarding hardest, so
 * it is checked over many secrets and many guesses rather than a chosen few.
 */
describe("Mastermind — narrowing the field", () => {
  it("never filters out the actual code", () => {
    const probes: Code[] = [[0, 0, 1, 1], [0, 1, 2, 3], [5, 5, 5, 5], [2, 4, 4, 0]];
    let checks = 0;
    for (let s = 0; s < 1296; s += 5) {
      const secret = decode(s, CLASSIC);
      let cand = fullSet(CLASSIC);
      for (const g of probes) {
        cand = filterConsistent(cand, g, score(g, secret, 6), CLASSIC);
        expect(Array.from(cand).includes(s), `secret ${codeLabel(secret)} after ${codeLabel(g)}`).toBe(true);
        checks++;
      }
    }
    expect(checks).toBe(260 * 4);
  });

  it("the buckets of a guess partition the candidates exactly", () => {
    const all = fullSet(CLASSIC);
    for (const g of [[0, 0, 1, 1], [0, 1, 2, 3], [3, 3, 3, 4]] as Code[]) {
      const stats = statsFor(g, all, CLASSIC);
      const total = stats.buckets.reduce((t, b) => t + b.size, 0);
      expect(total, `${codeLabel(g)} buckets must cover every code`).toBe(1296);
      // And each bucket is exactly what the filter would keep for that answer.
      for (const b of stats.buckets) {
        expect(filterConsistent(all, g, b.feedback, CLASSIC).length, `${codeLabel(g)} ${b.feedback.black}b${b.feedback.white}w`).toBe(b.size);
      }
    }
  });

  it("an all-black answer leaves exactly the guess itself", () => {
    const all = fullSet(CLASSIC);
    const g: Code = [1, 3, 3, 5];
    const left = filterConsistent(all, g, { black: 4, white: 0 }, CLASSIC);
    expect(left).toHaveLength(1);
    expect(decode(left[0], CLASSIC)).toEqual(g);
  });

  it("reports where the survivors agree, per position", () => {
    const all = fullSet(CLASSIC);
    // With everything still standing, every colour is equally likely everywhere.
    const flat = positionFrequencies(all, CLASSIC);
    expect(flat.estimated).toBe(false);
    for (const row of flat.freq) for (const v of row) expect(v).toBeCloseTo(1 / 6, 12);
    // Pin one peg and its column collapses while the others stay flat.
    const pinned = filterConsistent(all, [0, 0, 0, 0], { black: 1, white: 0 }, CLASSIC);
    const f = positionFrequencies(pinned, CLASSIC).freq;
    for (let pos = 0; pos < 4; pos++) {
      // Exactly one position holds the red; each position is equally likely to
      // be the one, so red sits at 1/4 in every column, not 1 in any of them.
      expect(f[pos][0]).toBeCloseTo(0.25, 10);
      const rest = f[pos].slice(1).reduce((t, v) => t + v, 0);
      expect(rest).toBeCloseTo(0.75, 10);
    }
  });
});

/**
 * T2889 — the information theory, checked against results nobody here invented.
 *
 * Two published facts about 6 colours × 4 pegs, arrived at independently:
 *  • Knuth's minimax opening is a two-pair guess, whose worst answer leaves 256.
 *  • The maximum-ENTROPY opening is four different colours, at ~3.0567 bits.
 * They are different guesses, and reproducing both — including the fact that they
 * disagree — is far stronger evidence than any self-consistency check.
 */
describe("Mastermind — entropy", () => {
  const all = fullSet(CLASSIC);

  it("reproduces Knuth's minimax opening: two pairs, worst case 256", () => {
    const byWorst = analyse(all, CLASSIC, true).ranked
      .slice()
      .sort((a, z) => a.worstCase - z.worstCase);
    expect(codeLabel(byWorst[0].code)).toBe("R R B B");
    expect(byWorst[0].worstCase).toBe(256);
  });

  it("reproduces the maximum-entropy opening: four colours, 3.0567 bits", () => {
    const best = analyse(all, CLASSIC, true).ranked[0];
    expect(codeLabel(best.code)).toBe("R B G Y");
    expect(best.entropyBits).toBeCloseTo(3.0567, 3);
    expect(best.worstCase).toBe(312);
    expect(best.buckets).toHaveLength(14);
  });

  it("the two criteria genuinely disagree — that is not a bug", () => {
    const ranked = analyse(all, CLASSIC, true).ranked;
    const topEntropy = ranked[0];
    const topMinimax = ranked.slice().sort((a, z) => a.worstCase - z.worstCase)[0];
    expect(codeLabel(topEntropy.code)).not.toBe(codeLabel(topMinimax.code));
    // The entropy pick really does have the bigger worst case, and the minimax
    // pick really does buy fewer bits on average.
    expect(topEntropy.worstCase).toBeGreaterThan(topMinimax.worstCase);
    expect(topEntropy.entropyBits).toBeGreaterThan(topMinimax.entropyBits);
  });

  it("entropy never exceeds log2 of the number of answers, and is 0 when there is one", () => {
    for (const g of [[0, 0, 0, 0], [0, 0, 1, 1], [0, 1, 2, 3]] as Code[]) {
      const s = statsFor(g, all, CLASSIC);
      expect(s.entropyBits).toBeLessThanOrEqual(Math.log2(s.buckets.length) + 1e-12);
      expect(s.entropyBits).toBeGreaterThan(0);
      expect(s.expectedRemaining).toBeLessThanOrEqual(s.worstCase);
    }
    // Against a single candidate there is nothing left to learn.
    const one = new Uint32Array([encode([0, 1, 2, 3], CLASSIC)]);
    const s = statsFor([0, 1, 2, 3], one, CLASSIC);
    expect(s.entropyBits).toBe(0);
    expect(s.couldBeSecret).toBe(true);
    expect(s.winChance).toBe(1);
  });

  it("an all-one-colour opening is the worst question available", () => {
    const ranked = analyse(all, CLASSIC, true).ranked;
    const worst = ranked[ranked.length - 1];
    expect(codeLabel(worst.code)).toBe("R R R R");
    expect(worst.buckets).toHaveLength(5); // only 0..4 blacks are possible
    expect(worst.entropyBits).toBeLessThan(ranked[0].entropyBits);
  });

  it("says when a ranking is estimated, and estimates only when it must", () => {
    // A small field is ranked exactly, every candidate against every candidate.
    const small = filterConsistent(all, [0, 1, 2, 3], { black: 2, white: 0 }, CLASSIC);
    const exact = analyse(small, CLASSIC, false);
    expect(exact.estimated).toBe(false);
    expect(exact.sampleSize).toBe(small.length);
    expect(exact.remaining).toBe(small.length);
    // The full space of the largest configuration cannot be, mid-game.
    const big: Config = { colours: 10, length: 6 };
    const mid = filterConsistent(fullSet(big), [0, 1, 2, 3, 4, 5], { black: 0, white: 2 }, big);
    const est = analyse(mid, big, false);
    expect(est.estimated).toBe(true);
    expect(est.sampleSize).toBeLessThan(est.remaining);
    expect(est.ranked.length).toBeGreaterThan(0);
  });
});

/**
 * T2890 — the strategy actually works, over every code there is.
 *
 * Playing the highest-entropy consistent guess every turn, against all 1,296
 * secrets: it must always finish, and finish in the band this approach is known
 * to land in. Knuth's minimax achieves 4.478 average with a worst case of 5;
 * entropy-greedy trades a slightly better average for an occasional sixth turn.
 * Pinning both numbers turns "the analysis looks right" into "the analysis wins
 * games".
 */
describe("Mastermind — playing it out", () => {
  it("breaks every one of the 1,296 codes, averaging under 4.5 turns", () => {
    const dist = new Map<number, number>();
    let total = 0, worst = 0;
    for (let s = 0; s < 1296; s++) {
      const secret = decode(s, CLASSIC);
      let cand = fullSet(CLASSIC);
      let turns = 0;
      for (;;) {
        turns++;
        expect(turns, `runaway on ${codeLabel(secret)}`).toBeLessThanOrEqual(8);
        const guess = analyse(cand, CLASSIC, turns === 1, 1).ranked[0].code;
        const fb = score(guess, secret, 6);
        if (fb.black === 4) break;
        cand = filterConsistent(cand, guess, fb, CLASSIC);
        expect(cand.length, `no candidates left for ${codeLabel(secret)}`).toBeGreaterThan(0);
      }
      dist.set(turns, (dist.get(turns) ?? 0) + 1);
      total += turns;
      if (turns > worst) worst = turns;
    }
    const average = total / 1296;
    expect(average, `average turns (got ${average.toFixed(4)})`).toBeCloseTo(4.4653, 3);
    expect(worst, "entropy-greedy needs a sixth turn on a few codes").toBe(6);
    expect(dist.get(1), "the opening wins outright exactly once").toBe(1);
    expect([...dist.values()].reduce((a, z) => a + z, 0)).toBe(1296);
  });

  it("finishes the largest configuration too, from a real starting position", () => {
    const cfg: Config = { colours: 10, length: 6 };
    const secret = decode(123_456, cfg);
    let cand = fullSet(cfg);
    let turns = 0;
    for (;;) {
      turns++;
      expect(turns, "runaway on 10×6").toBeLessThanOrEqual(12);
      const guess = analyse(cand, cfg, turns === 1, 1).ranked[0].code;
      const fb = score(guess, secret, cfg.colours);
      if (fb.black === cfg.length) break;
      cand = filterConsistent(cand, guess, fb, cfg);
      expect(cand.length, `lost the code on turn ${turns}`).toBeGreaterThan(0);
    }
    expect(turns).toBeGreaterThan(1);
  });
});
