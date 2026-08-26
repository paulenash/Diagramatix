/**
 * Mastermind — the game, and an information-theoretic analysis of it.
 *
 * RULES. The code setter picks a hidden code: `length` pegs drawn from `colours`
 * colours, repeats allowed. Each turn the code breaker guesses a full code and is
 * told two numbers:
 *   • BLACK pegs — right colour, right place.
 *   • WHITE pegs — right colour, wrong place.
 * The pegs say HOW MANY, never which, and that is the whole game.
 *
 * THE IDEA THE TILE IS BUILT AROUND. A guess is not an attempt to be right; it is
 * a QUESTION, and the answer is one of at most 20-odd peg pairs. Every guess
 * therefore partitions the candidates still standing into buckets — one per
 * possible answer — and the answer tells you which bucket the secret is in.
 * Shannon's entropy over those bucket sizes,
 *
 *      H(guess) = −Σ p_i log₂ p_i        where p_i = |bucket i| / |candidates|
 *
 * is exactly the expected number of BITS the answer will tell you. A guess that
 * splits 1,296 candidates into 14 fairly even buckets learns more than one that
 * usually answers "0 black, 0 white" and occasionally something else, even where
 * both have the same chance of being right outright.
 *
 * Starting from `colours^length` candidates the breaker needs log₂ of that many
 * bits in total — 10.34 for the classic 6 colours × 4 pegs. At the ~2.8 bits a
 * good opening buys, five turns is the floor, which is Knuth's result arrived at
 * from the other end.
 *
 * WHY THE POOL IS THE CANDIDATES THEMSELVES. A guess that CANNOT be the secret
 * can still be a fine question — occasionally a better one — but ranking those
 * as well multiplies the work by the size of the whole space, and it gives up the
 * free chance of simply being right. Everything ranked here is consistent with
 * the answers so far, so every suggestion could win outright this turn.
 *
 * NUMBERS ARE MEASURED, NOT ASSUMED. Where an analysis is estimated from a sample
 * rather than computed over everything, it says so, with the sample size. Pure
 * and dependency-free, so all of it is unit-testable on its own.
 */

/** A code is `length` colour indices; a candidate is that code as a base-`colours` integer. */
export type Code = number[];

export interface Config {
  /** How many colours are in play. */
  colours: number;
  /** How many pegs long the hidden code is. */
  length: number;
}

export const MIN_COLOURS = 6;
export const MAX_COLOURS = 10;
export const MIN_LENGTH = 3;
export const MAX_LENGTH = 6;

/**
 * The peg colours, in the order a setter picks them.
 *
 * Ten hues that stay distinguishable side by side — and because a peg is a small
 * circle with no room for a label, each carries a name and an initial, so the
 * board can be read aloud and colour is never the only channel carrying the
 * information.
 */
export const PEGS: { name: string; short: string; hex: string; ink: string }[] = [
  { name: "Red", short: "R", hex: "#dc2626", ink: "#ffffff" },
  { name: "Blue", short: "B", hex: "#2563eb", ink: "#ffffff" },
  { name: "Green", short: "G", hex: "#16a34a", ink: "#ffffff" },
  { name: "Yellow", short: "Y", hex: "#facc15", ink: "#422006" },
  { name: "Orange", short: "O", hex: "#ea580c", ink: "#ffffff" },
  { name: "Purple", short: "P", hex: "#7c3aed", ink: "#ffffff" },
  { name: "Cyan", short: "C", hex: "#0891b2", ink: "#ffffff" },
  { name: "Pink", short: "K", hex: "#db2777", ink: "#ffffff" },
  { name: "Lime", short: "L", hex: "#84cc16", ink: "#1a2e05" },
  { name: "Brown", short: "N", hex: "#78350f", ink: "#ffffff" },
];

export const isValidConfig = (cfg: Config): boolean =>
  Number.isInteger(cfg.colours) && Number.isInteger(cfg.length) &&
  cfg.colours >= MIN_COLOURS && cfg.colours <= MAX_COLOURS &&
  cfg.length >= MIN_LENGTH && cfg.length <= MAX_LENGTH;

/** How many codes exist. 216 at the small end (6×3), 1,000,000 at the large (10×6). */
export const totalCodes = (cfg: Config): number => cfg.colours ** cfg.length;

/** How many bits the breaker must extract in total, starting from nothing. */
export const totalBits = (cfg: Config): number => cfg.length * Math.log2(cfg.colours);

/** Index → code. Digit 0 is the LEFT-hand peg, so reading and writing agree. */
export function decode(index: number, cfg: Config): Code {
  const out = new Array<number>(cfg.length);
  let v = index;
  for (let i = cfg.length - 1; i >= 0; i--) { out[i] = v % cfg.colours; v = (v / cfg.colours) | 0; }
  return out;
}

/** Code → index. */
export function encode(code: Code, cfg: Config): number {
  let v = 0;
  for (let i = 0; i < cfg.length; i++) v = v * cfg.colours + code[i];
  return v;
}

export interface Feedback {
  /** Right colour, right place. */
  black: number;
  /** Right colour, wrong place. */
  white: number;
}

/**
 * The pegs a setter would hand back for this guess against this secret.
 *
 * Blacks are the exact matches. Whites are what is left once those are set aside:
 * for each colour, the smaller of "how many the guess has left" and "how many the
 * secret has left" is a match somewhere else. That min-of-counts rule is what
 * makes repeated colours behave — three reds against one red is one match, not
 * three.
 *
 * Symmetric in its two arguments, which is not an accident and is worth knowing:
 * scoring a guess against a candidate is the same operation as scoring the
 * candidate against the guess, which is why the filter below is allowed to treat
 * every candidate as if it were the secret.
 */
export function score(guess: Code, secret: Code, colours: number): Feedback {
  const n = guess.length;
  const gc = new Int32Array(colours);
  const sc = new Int32Array(colours);
  let black = 0;
  for (let i = 0; i < n; i++) {
    if (guess[i] === secret[i]) black++;
    else { gc[guess[i]]++; sc[secret[i]]++; }
  }
  // Exact matches were excluded from both tallies above, so this is already the
  // "wrong place" count and needs no subtraction.
  let white = 0;
  for (let k = 0; k < colours; k++) white += Math.min(gc[k], sc[k]);
  return { black, white };
}

/** Feedback as a single small integer, for use as a bucket index. */
export const feedbackKey = (f: Feedback, length: number): number => f.black * (length + 1) + f.white;
export const feedbackFromKey = (key: number, length: number): Feedback =>
  ({ black: (key / (length + 1)) | 0, white: key % (length + 1) });
/** Upper bound on a feedback key, so a bucket array can be sized once. */
export const feedbackSlots = (length: number): number => (length + 1) * (length + 1);

/**
 * Every peg pair a setter could ever hand back.
 *
 * `black + white ≤ length`, with one exception that trips people up: you can
 * never be told "all but one in place, and the odd one misplaced" — if
 * `length − 1` pegs are exact then the remaining peg has only its own position
 * left to sit in, so it is either exact too or matches nothing at all. So
 * (length−1, 1) is impossible, and the classic 4-peg game has 14 answers, not 15.
 */
export function allFeedbacks(length: number): Feedback[] {
  const out: Feedback[] = [];
  for (let b = 0; b <= length; b++) {
    for (let w = 0; w + b <= length; w++) {
      if (b === length - 1 && w === 1) continue;
      out.push({ black: b, white: w });
    }
  }
  return out;
}

/** Every code, as candidate indices. The breaker's starting position. */
export function fullSet(cfg: Config): Uint32Array {
  const total = totalCodes(cfg);
  const out = new Uint32Array(total);
  for (let i = 0; i < total; i++) out[i] = i;
  return out;
}

/**
 * Score a guess against a candidate INDEX without ever building the candidate.
 *
 * The inner loop of everything below: it runs once per (guess, candidate) pair,
 * and one analysis pass is millions of those. The candidate is decoded by
 * division as it goes, so no table of a million decoded codes has to exist, and
 * the guess's own tallies are rebuilt per candidate because which of its pegs are
 * exact depends on the candidate.
 */
function scoreIndex(guess: Code, index: number, cfg: Config, gScratch: Int32Array, sScratch: Int32Array): number {
  const { colours: c, length: n } = cfg;
  gScratch.fill(0);
  sScratch.fill(0);
  let black = 0;
  let v = index;
  for (let i = n - 1; i >= 0; i--) {
    const d = v % c;
    v = (v / c) | 0;
    if (d === guess[i]) black++;
    else { gScratch[guess[i]]++; sScratch[d]++; }
  }
  let white = 0;
  for (let k = 0; k < c; k++) {
    const g = gScratch[k];
    if (g > 0) { const s = sScratch[k]; white += g < s ? g : s; }
  }
  return black * (n + 1) + white;
}

/** Keep only the candidates that would have produced this feedback. */
export function filterConsistent(
  candidates: Uint32Array, guess: Code, fb: Feedback, cfg: Config,
): Uint32Array {
  const want = feedbackKey(fb, cfg.length);
  const out = new Uint32Array(candidates.length);
  const gs = new Int32Array(cfg.colours);
  const ss = new Int32Array(cfg.colours);
  let k = 0;
  for (let i = 0; i < candidates.length; i++) {
    const idx = candidates[i];
    if (scoreIndex(guess, idx, cfg, gs, ss) === want) out[k++] = idx;
  }
  return out.slice(0, k);
}

/** What one guess is worth against a set of candidates. */
export interface GuessStats {
  code: Code;
  /** Expected bits the answer will reveal — Shannon entropy over the buckets. */
  entropyBits: number;
  /** Bucket sizes by feedback, largest first; empty buckets omitted. */
  buckets: { feedback: Feedback; size: number }[];
  /** Expected candidates still standing after the answer — Σ p_i · |bucket i|. */
  expectedRemaining: number;
  /** The unluckiest answer: the biggest bucket. Knuth's minimax criterion. */
  worstCase: number;
  /** True when this guess is itself still a live candidate, so it might just win. */
  couldBeSecret: boolean;
  /** Chance it wins outright this turn: 1/|candidates| when it is live. */
  winChance: number;
}

/** Entropy and bucket shape for one specific guess, over a candidate set. */
export function statsFor(guess: Code, candidates: Uint32Array, cfg: Config): GuessStats {
  const counts = new Int32Array(feedbackSlots(cfg.length));
  const gs = new Int32Array(cfg.colours);
  const ss = new Int32Array(cfg.colours);
  const gIndex = encode(guess, cfg);
  let live = false;
  for (let i = 0; i < candidates.length; i++) {
    const idx = candidates[i];
    if (idx === gIndex) live = true;
    counts[scoreIndex(guess, idx, cfg, gs, ss)]++;
  }
  return summarise(guess, counts, candidates.length, live, cfg);
}

function summarise(
  guess: Code, counts: Int32Array, total: number, live: boolean, cfg: Config,
): GuessStats {
  let entropy = 0, expected = 0, worst = 0;
  const buckets: { feedback: Feedback; size: number }[] = [];
  for (let key = 0; key < counts.length; key++) {
    const size = counts[key];
    if (size === 0) continue;
    const p = size / total;
    entropy -= p * Math.log2(p);
    expected += p * size;
    if (size > worst) worst = size;
    buckets.push({ feedback: feedbackFromKey(key, cfg.length), size });
  }
  buckets.sort((a, z) => z.size - a.size);
  return {
    code: guess, entropyBits: entropy, buckets,
    expectedRemaining: expected, worstCase: worst,
    couldBeSecret: live, winChance: live ? 1 / total : 0,
  };
}

/**
 * The integer partitions of `length` into at most `colours` parts, as codes.
 *
 * These are the only genuinely different OPENING guesses. Before any answer is
 * known the candidate set is everything, and that set is unchanged by permuting
 * positions or by renaming colours — so two openings related by either symmetry
 * cut it into identically sized buckets and have identical entropy. What survives
 * both symmetries is just the guess's SHAPE: how many pegs share a colour.
 *
 * On 6 colours × 4 pegs that is 5 openings to compare (AAAA, AAAB, AABB, AABC,
 * ABCD) instead of 1,296; on 10 × 6 it is 11 instead of a million. That is what
 * makes the opening analysis exact rather than sampled — the one turn where the
 * candidate set is far too big to sample well is also the one turn where almost
 * every guess is a duplicate of another. `T2887` pins the claim.
 */
export function openingPatterns(cfg: Config): Code[] {
  const out: Code[] = [];
  const parts: number[] = [];
  const walk = (left: number, max: number) => {
    if (left === 0) {
      if (parts.length > cfg.colours) return;
      const code: Code = [];
      parts.forEach((size, colour) => { for (let k = 0; k < size; k++) code.push(colour); });
      out.push(code);
      return;
    }
    for (let take = Math.min(left, max); take >= 1; take--) {
      parts.push(take);
      walk(left - take, take);
      parts.pop();
    }
  };
  walk(cfg.length, cfg.length);
  return out;
}

export interface Analysis {
  /** Best first, by entropy. */
  ranked: GuessStats[];
  /** How many candidates are still standing. */
  remaining: number;
  /** Bits still to be extracted: log₂(remaining). */
  bitsRemaining: number;
  /** True when the ranking was estimated from a sample rather than computed whole. */
  estimated: boolean;
  /** Candidates actually scored against (= remaining when not estimated). */
  sampleSize: number;
  /** How many guesses were ranked. */
  poolSize: number;
  /** Set when the opening shortcut applied — the ranking is exact and tiny. */
  openingShortcut: boolean;
}

/**
 * Work allowed in one analysis pass, in (guess × candidate) scorings.
 *
 * Measured, not guessed: a scoring is roughly `length + colours` integer
 * operations, and this budget lands around a fifth of a second on the machine
 * this was written on. Past it the pass samples and says so — a tile that
 * silently freezes for a minute is worse than one that says "estimated from
 * 1,732 of 340,000".
 */
export const ANALYSIS_BUDGET = 3_000_000;

/**
 * Rank the guesses worth making against the candidates still standing.
 *
 * Three regimes, in order of preference:
 *  1. THE OPENING — nothing is known, so only the shapes differ. A handful of
 *     representatives, each scored against every candidate. Exact and fast.
 *  2. EXACT — pool × candidates fits the budget, so every live candidate is
 *     ranked against every live candidate.
 *  3. SAMPLED — it does not fit, so both sides are thinned by an even stride
 *     (never a random draw: the same position must always give the same advice)
 *     and `estimated` is set.
 */
export function analyse(
  candidates: Uint32Array, cfg: Config, isOpening: boolean, topN = 12,
): Analysis {
  const remaining = candidates.length;
  const base = { remaining, bitsRemaining: remaining > 0 ? Math.log2(remaining) : 0 };
  if (remaining === 0) {
    return { ...base, ranked: [], estimated: false, sampleSize: 0, poolSize: 0, openingShortcut: false };
  }

  if (isOpening && remaining === totalCodes(cfg)) {
    const pool = openingPatterns(cfg);
    const ranked = pool
      .map((g) => statsFor(g, candidates, cfg))
      .sort((a, z) => z.entropyBits - a.entropyBits || a.worstCase - z.worstCase);
    return {
      ...base, ranked: ranked.slice(0, topN), estimated: false,
      sampleSize: remaining, poolSize: pool.length, openingShortcut: true,
    };
  }

  const exact = remaining * remaining <= ANALYSIS_BUDGET;
  // Split the budget between the two sides so neither is starved: with a square
  // budget each side gets its square root, capped at what actually exists.
  const side = Math.max(1, Math.floor(Math.sqrt(ANALYSIS_BUDGET)));
  const pool = exact ? candidates : stride(candidates, Math.min(remaining, side));
  const sample = exact ? candidates : stride(candidates, Math.min(remaining, side));

  const counts = new Int32Array(feedbackSlots(cfg.length));
  const gs = new Int32Array(cfg.colours);
  const ss = new Int32Array(cfg.colours);
  const ranked: GuessStats[] = [];
  for (let p = 0; p < pool.length; p++) {
    counts.fill(0);
    const guess = decode(pool[p], cfg);
    for (let i = 0; i < sample.length; i++) counts[scoreIndex(guess, sample[i], cfg, gs, ss)]++;
    // Every pooled guess is drawn FROM the candidates, so it is live by
    // construction — even when the thinned sample it was scored against happens
    // not to contain it.
    ranked.push(summarise(guess, counts, sample.length, true, cfg));
  }
  ranked.sort((a, z) => z.entropyBits - a.entropyBits || a.worstCase - z.worstCase);
  return {
    ...base, ranked: ranked.slice(0, topN), estimated: !exact,
    sampleSize: sample.length, poolSize: pool.length, openingShortcut: false,
  };
}

/**
 * An evenly spaced subset of `count` items.
 *
 * A stride rather than a random draw, deliberately: the same position must always
 * produce the same advice, or a player comparing two runs of the same game would
 * watch the ranking move for no reason they could see.
 */
function stride(items: Uint32Array, count: number): Uint32Array {
  if (count >= items.length) return items;
  const out = new Uint32Array(count);
  const step = items.length / count;
  for (let i = 0; i < count; i++) out[i] = items[Math.min(items.length - 1, Math.floor(i * step))];
  return out;
}

/**
 * How often each colour appears in each position across the candidates.
 *
 * The compact picture of what is still unknown: `freq[position][colour]` as a
 * fraction. A column collapsed to a single colour is a peg the breaker has
 * already pinned down even if no black peg ever said so; a flat column is a
 * position nothing has touched yet. Neither is visible in a list of past guesses.
 *
 * Sampled by stride above `MAX_FREQ_SCAN` candidates, and the caller is told.
 */
export const MAX_FREQ_SCAN = 200_000;

export function positionFrequencies(
  candidates: Uint32Array, cfg: Config,
): { freq: number[][]; scanned: number; estimated: boolean } {
  const { colours: c, length: n } = cfg;
  const scan = candidates.length > MAX_FREQ_SCAN ? stride(candidates, MAX_FREQ_SCAN) : candidates;
  const counts: number[][] = Array.from({ length: n }, () => new Array<number>(c).fill(0));
  for (let i = 0; i < scan.length; i++) {
    let v = scan[i];
    for (let pos = n - 1; pos >= 0; pos--) { counts[pos][v % c]++; v = (v / c) | 0; }
  }
  const denom = Math.max(1, scan.length);
  return {
    freq: counts.map((row) => row.map((x) => x / denom)),
    scanned: scan.length,
    estimated: scan.length < candidates.length,
  };
}

/** A random secret, for when the tile itself is the code setter. */
export function randomSecret(cfg: Config, rnd: () => number = Math.random): Code {
  return Array.from({ length: cfg.length }, () => Math.floor(rnd() * cfg.colours));
}

export const sameCode = (a: Code, z: Code): boolean =>
  a.length === z.length && a.every((v, i) => v === z[i]);

/** "R G G Y" — a code in initials, for a title or a log line. */
export const codeLabel = (code: Code): string => code.map((d) => PEGS[d].short).join(" ");
