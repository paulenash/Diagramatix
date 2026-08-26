"use client";

/**
 * Mastermind, played as a question-asking exercise rather than a guessing one.
 *
 * The board is on the left, and to the right of it the two things a player
 * cannot work out in their head:
 *
 *  • WHAT THIS GUESS IS WORTH. Every guess splits the codes still standing into
 *    buckets, one per peg answer it could draw. The panel shows that split as
 *    bars, and its Shannon entropy — the expected number of BITS the setter's
 *    answer will hand over. Beside it, the best questions available, ranked.
 *
 *  • WHAT IS LEFT. Not a list (there may be 300,000) but a picture: how many
 *    codes survive, how many bits that still is, and a position × colour grid
 *    showing where the remaining codes agree. A column collapsed to one colour
 *    is a peg already pinned down even though no black peg ever said so.
 *
 * Each played row then compares the bits the guess PROMISED against the bits the
 * answer actually delivered. Those differ every turn — entropy is an average over
 * answers you did not get — and watching them differ is the clearest way to see
 * what the number means.
 *
 * Three roles for the setter: the tile picks a secret, you pick one for it, or
 * someone else holds it and you type in the pegs. The third is the useful one for
 * a real game, and it checks your pegs against the answers you have already given
 * — an impossible combination is reported rather than quietly emptying the board.
 *
 * All the game and all the information theory live in `app/lib/games/mastermind.ts`;
 * this file is interaction and presentation only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  type Code, type Config, type Feedback, type Analysis, type GuessStats,
  PEGS, MIN_COLOURS, MAX_COLOURS, MIN_LENGTH, MAX_LENGTH,
  totalCodes, totalBits, fullSet, score, filterConsistent, statsFor, analyse,
  positionFrequencies, randomSecret, sameCode, codeLabel, allFeedbacks, encode,
} from "@/app/lib/games/mastermind";

type Setter = "app" | "you" | "elsewhere";

interface Played {
  code: Code;
  feedback: Feedback;
  /** Candidates before and after this answer — the two give the bits gained. */
  before: number;
  after: number;
  /** Bits the guess promised on average, before the answer came back. */
  expectedBits: number;
}

/** Bits actually delivered: how far the answer narrowed the field. */
const bitsGained = (p: Played): number => (p.after > 0 ? Math.log2(p.before / p.after) : Math.log2(p.before));

export function MastermindClient() {
  const [phase, setPhase] = useState<"setup" | "play">("setup");
  const [colours, setColours] = useState(6);
  const [length, setLength] = useState(4);
  const [setter, setSetter] = useState<Setter>("app");

  const cfg = useMemo<Config>(() => ({ colours, length }), [colours, length]);

  const [secret, setSecret] = useState<Code | null>(null);
  const [secretDraft, setSecretDraft] = useState<(number | null)[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [candidates, setCandidates] = useState<Uint32Array>(() => new Uint32Array(0));
  const [history, setHistory] = useState<Played[]>([]);
  const [draft, setDraft] = useState<(number | null)[]>([]);
  /** Manual mode: the guess is on the board and the setter's pegs are awaited. */
  const [pending, setPending] = useState<Code | null>(null);
  const [pegError, setPegError] = useState<string | null>(null);
  const [won, setWon] = useState(false);

  const start = useCallback(() => {
    const chosen: Code | null =
      setter === "app" ? randomSecret(cfg)
      : setter === "you" ? (secretDraft.every((d) => d !== null) ? (secretDraft as Code) : null)
      : null;
    if (setter === "you" && !chosen) return;
    setSecret(chosen);
    setRevealed(false);
    setCandidates(fullSet(cfg));
    setHistory([]);
    setDraft(new Array(cfg.length).fill(null));
    setPending(null);
    setPegError(null);
    setWon(false);
    setPhase("play");
  }, [cfg, setter, secretDraft]);

  // Keep the two drafts the right length as the configuration changes.
  useEffect(() => { setSecretDraft(new Array(length).fill(null)); }, [length, colours]);

  const complete = draft.length === cfg.length && draft.every((d) => d !== null);
  const guess = complete ? (draft as Code) : null;

  // ── Analysis, deferred one tick so the "working" state paints first ───────
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [guessStats, setGuessStats] = useState<GuessStats | null>(null);
  const [busy, setBusy] = useState(false);

  const isOpening = history.length === 0;

  useEffect(() => {
    if (phase !== "play" || won) return;
    setBusy(true);
    let live = true;
    const t = window.setTimeout(() => {
      const a = analyse(candidates, cfg, isOpening, 10);
      if (!live) return;
      setAnalysis(a);
      setBusy(false);
    }, 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [phase, won, candidates, cfg, isOpening]);

  useEffect(() => {
    if (phase !== "play" || won || !guess || candidates.length === 0) { setGuessStats(null); return; }
    let live = true;
    const t = window.setTimeout(() => {
      // Scoring one guess against every candidate is the cheap direction — a
      // single pass, where the ranking above is one pass per guess ranked.
      if (live) setGuessStats(statsFor(guess, candidates, cfg));
    }, 0);
    return () => { live = false; window.clearTimeout(t); };
  }, [phase, won, guess && encode(guess, cfg), candidates, cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const frequencies = useMemo(
    () => (phase === "play" ? positionFrequencies(candidates, cfg) : null),
    [phase, candidates, cfg],
  );

  /** Apply an answer — from the tile's own secret, or typed in by the player. */
  const applyFeedback = useCallback((code: Code, fb: Feedback) => {
    const next = filterConsistent(candidates, code, fb, cfg);
    if (next.length === 0) {
      setPegError(
        "No code is consistent with that answer and the ones before it. Either a peg count is wrong, or an earlier one was.",
      );
      return;
    }
    setPegError(null);
    setHistory((h) => [...h, { code, feedback: fb, before: candidates.length, after: next.length, expectedBits: guessStats?.entropyBits ?? statsFor(code, candidates, cfg).entropyBits }]);
    setCandidates(next);
    setPending(null);
    setDraft(new Array(cfg.length).fill(null));
    if (fb.black === cfg.length) setWon(true);
  }, [candidates, cfg, guessStats]);

  const play = useCallback(() => {
    if (!guess) return;
    if (secret) {
      const fb = score(guess, secret, cfg.colours);
      if (fb.black === cfg.length) {
        setHistory((h) => [...h, { code: guess, feedback: fb, before: candidates.length, after: 1, expectedBits: guessStats?.entropyBits ?? 0 }]);
        setCandidates(new Uint32Array([encode(guess, cfg)]));
        setDraft(new Array(cfg.length).fill(null));
        setWon(true);
        return;
      }
      applyFeedback(guess, fb);
    } else {
      setPending(guess);
      setPegError(null);
    }
  }, [guess, secret, cfg, candidates, guessStats, applyFeedback]);

  const setSlot = useCallback((i: number, colour: number) => {
    setDraft((d) => { const next = [...d]; next[i] = colour; return next; });
  }, []);

  /** Fill the next empty slot, so a whole guess can be entered by clicking colours. */
  const pushColour = useCallback((colour: number) => {
    setDraft((d) => {
      const i = d.findIndex((x) => x === null);
      if (i === -1) return d;
      const next = [...d]; next[i] = colour; return next;
    });
  }, []);

  if (phase === "setup") {
    return (
      <div className="min-h-screen dgx-dashboard-bg">
        <Header />
        <main className="max-w-2xl mx-auto p-6">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-gray-900 mb-1">The code setter&rsquo;s choices</h2>
              <p className="text-xs text-gray-600">
                A hidden code of <strong>{length}</strong> pegs drawn from <strong>{colours}</strong> colours,
                repeats allowed — <strong>{totalCodes(cfg).toLocaleString()}</strong> possible codes,
                or <strong>{totalBits(cfg).toFixed(2)} bits</strong> for the breaker to find.
              </p>
            </div>

            <Choice label="Colours" value={colours} onChange={setColours} min={MIN_COLOURS} max={MAX_COLOURS} swatches />
            <Choice label="Code length" value={length} onChange={setLength} min={MIN_LENGTH} max={MAX_LENGTH} />

            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Who holds the code</h3>
              <div className="space-y-1.5">
                {([
                  ["app", "This tile picks one at random", "It answers every guess for you. Good for testing a strategy."],
                  ["you", "You pick it, then break it yourself", "Useful for studying one specific code."],
                  ["elsewhere", "Someone else holds it — you type the pegs", "The real game. Answers are checked for consistency."],
                ] as [Setter, string, string][]).map(([k, title, note]) => (
                  <button key={k} onClick={() => setSetter(k)}
                    className={"w-full text-left px-3 py-2 rounded border transition-colors " +
                      (setter === k ? "border-blue-500 bg-blue-50" : "border-gray-300 bg-white hover:border-blue-300")}>
                    <span className="text-xs font-medium text-gray-900">{title}</span>
                    <span className="block text-[11px] text-gray-600">{note}</span>
                  </button>
                ))}
              </div>
            </div>

            {setter === "you" && (
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">Your secret code</h3>
                <div className="flex items-center gap-2 mb-2">
                  {secretDraft.map((d, i) => (
                    <span key={i} className="w-9 h-9 rounded-full border-2 border-gray-300 flex items-center justify-center"
                      style={d === null ? undefined : { background: PEGS[d].hex, borderColor: PEGS[d].hex, color: PEGS[d].ink }}>
                      {d === null ? <span className="text-gray-300 text-xs">{i + 1}</span> : <span className="text-xs font-bold">{PEGS[d].short}</span>}
                    </span>
                  ))}
                  {secretDraft.some((d) => d !== null) && (
                    <button onClick={() => setSecretDraft(new Array(length).fill(null))}
                      className="px-2 py-1 text-[11px] border border-gray-300 rounded hover:bg-gray-50">Clear</button>
                  )}
                </div>
                <Palette colours={colours} onPick={(c) => setSecretDraft((d) => {
                  const i = d.findIndex((x) => x === null);
                  if (i === -1) return d;
                  const next = [...d]; next[i] = c; return next;
                })} />
              </div>
            )}

            <button onClick={start}
              disabled={setter === "you" && secretDraft.some((d) => d === null)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
              Start — you are the code breaker
            </button>
            <HowItWorks />
          </section>
        </main>
      </div>
    );
  }

  const turn = history.length + 1;

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <Header />
      <main className="max-w-[100rem] mx-auto p-6 grid gap-5 lg:grid-cols-[minmax(320px,auto)_1fr_1fr] items-start">
        {/* ── The board ─────────────────────────────────────────── */}
        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">
                {colours} colours × {length} pegs
              </h2>
              <span className="text-[11px] text-gray-500">turn {turn}</span>
            </div>

            {history.length > 0 && (
              <table className="w-full text-[11px] mb-3">
                <thead>
                  <tr className="text-gray-500 uppercase tracking-wide text-[10px]">
                    <th className="text-left font-semibold pb-1">Guess</th>
                    <th className="text-left font-semibold pb-1">Pegs</th>
                    <th className="text-right font-semibold pb-1" title="Bits the guess promised on average, against bits the answer actually delivered">
                      Bits: said → got
                    </th>
                    <th className="text-right font-semibold pb-1">Left</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((p, k) => (
                    <tr key={k} className="border-t border-gray-100">
                      <td className="py-1"><CodeRow code={p.code} size={22} /></td>
                      <td className="py-1"><FeedbackPegs fb={p.feedback} length={cfg.length} /></td>
                      <td className="py-1 text-right tabular-nums text-gray-600">
                        {p.expectedBits.toFixed(2)} → <strong className={bitsGained(p) >= p.expectedBits ? "text-green-700" : "text-gray-900"}>{bitsGained(p).toFixed(2)}</strong>
                      </td>
                      <td className="py-1 text-right tabular-nums text-gray-600">{p.after.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {won ? (
              <div className="px-3 py-2 rounded border border-green-400 bg-green-50">
                <p className="text-xs font-semibold text-green-900">
                  Broken in {history.length} turn{history.length === 1 ? "" : "s"}.
                </p>
                <p className="text-[11px] text-green-800 mt-0.5">
                  {totalBits(cfg).toFixed(2)} bits found at an average of {(totalBits(cfg) / Math.max(1, history.length)).toFixed(2)} bits a turn.
                </p>
              </div>
            ) : pending ? (
              <PegEntry
                code={pending} cfg={cfg} error={pegError}
                onCancel={() => { setPending(null); setPegError(null); }}
                onSubmit={(fb) => applyFeedback(pending, fb)}
              />
            ) : (
              <>
                <div className="flex items-center gap-2 mb-2">
                  {draft.map((d, i) => (
                    <button key={i} onClick={() => setDraft((x) => { const n = [...x]; n[i] = null; return n; })}
                      title={d === null ? `Peg ${i + 1}` : `${PEGS[d].name} — click to clear`}
                      className="w-10 h-10 rounded-full border-2 border-gray-300 flex items-center justify-center hover:border-blue-400"
                      style={d === null ? undefined : { background: PEGS[d].hex, borderColor: PEGS[d].hex, color: PEGS[d].ink }}>
                      {d === null ? <span className="text-gray-300 text-xs">{i + 1}</span> : <span className="text-xs font-bold">{PEGS[d].short}</span>}
                    </button>
                  ))}
                </div>
                <Palette colours={cfg.colours} onPick={pushColour} />
                <div className="flex items-center gap-2 mt-3">
                  <button onClick={play} disabled={!complete}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
                    {secret ? "Guess" : "Guess — then enter the pegs"}
                  </button>
                  {draft.some((d) => d !== null) && (
                    <button onClick={() => setDraft(new Array(cfg.length).fill(null))}
                      className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Clear</button>
                  )}
                  {analysis?.ranked[0] && (
                    <button onClick={() => setDraft([...analysis.ranked[0].code])}
                      className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50"
                      title="Load the highest-entropy guess into the pegs above">
                      Use the best question
                    </button>
                  )}
                </div>
              </>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => setPhase("setup")}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">Change setup</button>
            <button onClick={start}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">
              {setter === "app" ? "New secret" : "Restart"}
            </button>
            {secret && !won && (
              <button onClick={() => setRevealed((r) => !r)}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">
                {revealed ? "Hide the code" : "Reveal the code"}
              </button>
            )}
          </div>
          {secret && (revealed || won) && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">The code</span>
              <CodeRow code={secret} size={24} />
            </div>
          )}
        </div>

        {/* ── What this guess is worth ──────────────────────────── */}
        <div className="space-y-4">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">What this guess is worth</h2>
            {won ? (
              <p className="text-xs text-gray-500 mt-2">The code is broken — nothing left to ask.</p>
            ) : !guess ? (
              <p className="text-[11px] text-gray-500 mt-1">
                Build a guess on the left and its split appears here — every answer it could draw, and how
                many bits it buys on average.
              </p>
            ) : !guessStats ? (
              <p className="text-xs text-gray-500 mt-2">Working out the split…</p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 mb-3">
                  <Stat label="Entropy" value={`${guessStats.entropyBits.toFixed(3)}`} unit="bits" strong
                    title="Expected bits the setter's answer will hand over — the average over every answer it could give, weighted by how likely each is" />
                  <Stat label="Answers" value={String(guessStats.buckets.length)} unit={`of ${allFeedbacks(cfg.length).length}`}
                    title="How many different peg answers this guess can actually draw from the codes still standing" />
                  <Stat label="Expected left" value={guessStats.expectedRemaining.toFixed(1)}
                    title="Codes still standing after the answer, averaged over the answers" />
                  <Stat label="Worst case" value={guessStats.worstCase.toLocaleString()}
                    title="The unluckiest answer — the biggest bucket. Knuth's minimax criterion picks the guess that minimises this." />
                </div>
                {guessStats.couldBeSecret ? (
                  <p className="text-[11px] text-green-800 bg-green-50 border border-green-300 rounded px-2.5 py-1.5 mb-3">
                    This guess is still a live candidate — a {(guessStats.winChance * 100).toFixed(guessStats.winChance > 0.01 ? 1 : 3)}% chance it simply wins this turn.
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-300 rounded px-2.5 py-1.5 mb-3">
                    This guess cannot be the code — it contradicts an answer you already have. Still a legal
                    question, and sometimes a sharper one, but it cannot win this turn.
                  </p>
                )}
                <BucketChart stats={guessStats} total={candidates.length} length={cfg.length} />
              </>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">Best questions</h2>
            {won ? (
              <p className="text-xs text-gray-500 mt-2">—</p>
            ) : busy || !analysis ? (
              <p className="text-xs text-gray-500 mt-2">Ranking the candidates…</p>
            ) : (
              <>
                <p className="text-[11px] text-gray-500 mt-1 mb-2">
                  {analysis.openingShortcut ? (
                    <>
                      Opening move: only the guess&rsquo;s <em>shape</em> matters, since nothing is known yet and the
                      full set of codes survives any renaming of colours or reordering of positions. That is{" "}
                      <strong>{analysis.poolSize}</strong> genuinely different openings instead of{" "}
                      {analysis.remaining.toLocaleString()} — so this ranking is exact.
                    </>
                  ) : analysis.estimated ? (
                    <>
                      Estimated: {analysis.poolSize.toLocaleString()} guesses scored against a spread of{" "}
                      {analysis.sampleSize.toLocaleString()} of the {analysis.remaining.toLocaleString()} codes left.
                      Ranking every pair would be {(analysis.remaining ** 2).toExponential(1)} comparisons.
                    </>
                  ) : (
                    <>Exact: every one of the {analysis.remaining.toLocaleString()} codes left, ranked against every other.</>
                  )}
                </p>
                <ul className="space-y-1">
                  {analysis.ranked.map((g, k) => (
                    <li key={k}>
                      <button onClick={() => setDraft([...g.code])} disabled={!!pending}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50 text-left">
                        <span className="w-4 text-[10px] text-gray-400 tabular-nums">{k + 1}</span>
                        <CodeRow code={g.code} size={20} />
                        <span className="ml-auto text-[11px] tabular-nums text-gray-700">
                          <strong>{g.entropyBits.toFixed(3)}</strong> bits
                        </span>
                        <span className="text-[10px] tabular-nums text-gray-400 w-20 text-right">worst {g.worstCase.toLocaleString()}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>

        {/* ── What is left ──────────────────────────────────────── */}
        <div className="space-y-4">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">What is left</h2>
            <div className="grid grid-cols-3 gap-2 mt-2 mb-3">
              <Stat label="Codes" value={candidates.length.toLocaleString()} strong />
              <Stat label="Still to find" value={(candidates.length > 0 ? Math.log2(candidates.length) : 0).toFixed(2)} unit="bits" />
              <Stat label="Ruled out" value={`${(100 * (1 - candidates.length / totalCodes(cfg))).toFixed(2)}%`} />
            </div>
            <Progress found={totalBits(cfg) - (candidates.length > 0 ? Math.log2(candidates.length) : 0)} total={totalBits(cfg)} />
            {frequencies && (
              <>
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1.5">
                  Where the survivors agree
                </h3>
                <p className="text-[11px] text-gray-500 mb-2">
                  How often each colour appears in each position across the codes still standing. A column
                  down to one colour is a peg already settled; an even column is a position nothing has
                  touched yet.
                  {frequencies.estimated && ` Sampled from ${frequencies.scanned.toLocaleString()} of them.`}
                </p>
                <FrequencyGrid freq={frequencies.freq} colours={cfg.colours} />
              </>
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">Codes still standing</h2>
            <p className="text-[11px] text-gray-500 mt-1 mb-2">
              {candidates.length <= 60
                ? `All ${candidates.length.toLocaleString()} of them.`
                : `A spread of 60 across the ${candidates.length.toLocaleString()} left — evenly spaced, not the first 60, so they are representative.`}
            </p>
            <SurvivorList candidates={candidates} cfg={cfg} onPick={(c) => !pending && !won && setDraft(c)} />
          </section>
        </div>
      </main>
    </div>
  );
}

/** A row of colour buttons — how every code on this page gets entered. */
function Palette({ colours, onPick }: { colours: number; onPick: (c: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PEGS.slice(0, colours).map((p, i) => (
        <button key={i} onClick={() => onPick(i)} title={p.name}
          className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-[11px] font-bold hover:scale-110 transition-transform"
          style={{ background: p.hex, borderColor: p.hex, color: p.ink }}>
          {p.short}
        </button>
      ))}
    </div>
  );
}

/** A code as a row of pegs. */
function CodeRow({ code, size = 20 }: { code: Code; size?: number }) {
  return (
    <span className="inline-flex gap-1 align-middle">
      {code.map((d, i) => (
        <span key={i} title={PEGS[d].name} style={{ width: size, height: size, background: PEGS[d].hex, color: PEGS[d].ink }}
          className="rounded-full inline-flex items-center justify-center text-[9px] font-bold shrink-0">
          {PEGS[d].short}
        </span>
      ))}
    </span>
  );
}

/**
 * The answer, drawn the way a real board shows it: black pegs then white, in a
 * fixed number of slots so the empty ones say "and no more than that".
 */
function FeedbackPegs({ fb, length }: { fb: Feedback; length: number }) {
  return (
    <span className="inline-flex gap-0.5 items-center" title={`${fb.black} black (right colour, right place), ${fb.white} white (right colour, wrong place)`}>
      {Array.from({ length }, (_, i) => {
        const kind = i < fb.black ? "black" : i < fb.black + fb.white ? "white" : "none";
        return (
          <span key={i} className={"w-2.5 h-2.5 rounded-full border " +
            (kind === "black" ? "bg-gray-900 border-gray-900"
              : kind === "white" ? "bg-white border-gray-500"
              : "bg-gray-100 border-gray-200")} />
        );
      })}
      <span className="ml-1 text-[10px] text-gray-500 tabular-nums">{fb.black}b {fb.white}w</span>
    </span>
  );
}

/**
 * Entering the setter's answer when someone else holds the code.
 *
 * Impossible pairs are not offered at all rather than rejected afterwards —
 * (length−1, 1) in particular, which no setter can ever hand back.
 */
function PegEntry({ code, cfg, error, onSubmit, onCancel }: {
  code: Code; cfg: Config; error: string | null;
  onSubmit: (fb: Feedback) => void; onCancel: () => void;
}) {
  const [black, setBlack] = useState<number | null>(null);
  const [white, setWhite] = useState<number | null>(null);
  const options = allFeedbacks(cfg.length);
  const blacks = [...new Set(options.map((f) => f.black))];
  const whites = black === null ? [] : options.filter((f) => f.black === black).map((f) => f.white);

  return (
    <div className="rounded border border-blue-300 bg-blue-50 p-3">
      <p className="text-[11px] text-gray-700 mb-2">
        You guessed <CodeRow code={code} size={18} />. What did the code setter answer?
      </p>
      <div className="space-y-2">
        <PegPick label="Black — right colour, right place" values={blacks} value={black}
          onPick={(v) => { setBlack(v); setWhite(null); }} tone="black" />
        {black !== null && (
          <PegPick label="White — right colour, wrong place" values={whites} value={white}
            onPick={setWhite} tone="white" />
        )}
      </div>
      {error && <p className="text-[11px] text-red-700 bg-red-50 border border-red-300 rounded px-2 py-1 mt-2">{error}</p>}
      <div className="flex gap-2 mt-3">
        <button onClick={() => black !== null && white !== null && onSubmit({ black, white })}
          disabled={black === null || white === null}
          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300">
          Record the answer
        </button>
        <button onClick={onCancel} className="px-2.5 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">
          Take the guess back
        </button>
      </div>
    </div>
  );
}

function PegPick({ label, values, value, onPick, tone }: {
  label: string; values: number[]; value: number | null; onPick: (v: number) => void; tone: "black" | "white";
}) {
  return (
    <div>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</span>
      <div className="flex gap-1">
        {values.map((v) => (
          <button key={v} onClick={() => onPick(v)}
            className={"w-8 h-8 rounded border-2 text-xs font-semibold transition-colors " +
              (value === v
                ? tone === "black" ? "bg-gray-900 border-gray-900 text-white" : "bg-white border-gray-900 text-gray-900"
                : "bg-white border-gray-300 text-gray-700 hover:border-blue-400")}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The split, drawn.
 *
 * One bar per answer the guess could draw, widest first. This IS the entropy: a
 * few fat bars is a question that usually tells you little, many even bars is one
 * that always tells you a lot. Seeing the shape makes the single number mean
 * something.
 */
function BucketChart({ stats, total, length }: { stats: GuessStats; total: number; length: number }) {
  const max = stats.buckets[0]?.size ?? 1;
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        Where the answer would leave you
      </h3>
      <ul className="space-y-0.5">
        {stats.buckets.map((b, k) => {
          const win = b.feedback.black === length;
          return (
            <li key={k} className="flex items-center gap-2">
              <span className="w-24 shrink-0"><FeedbackPegs fb={b.feedback} length={length} /></span>
              <span className="flex-1 h-3 bg-gray-100 rounded-sm overflow-hidden">
                <span className={"block h-full rounded-sm " + (win ? "bg-green-500" : "bg-blue-500")}
                  style={{ width: `${Math.max(1, (100 * b.size) / max)}%` }} />
              </span>
              <span className="w-28 shrink-0 text-right text-[10px] tabular-nums text-gray-600">
                {b.size.toLocaleString()} · {((100 * b.size) / total).toFixed(1)}%
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-gray-400 mt-1.5">
        Green is the answer that means you have won. {stats.buckets.length} answers over {total.toLocaleString()} codes.
      </p>
    </div>
  );
}

/** Position × colour frequency across the survivors. */
function FrequencyGrid({ freq, colours }: { freq: number[][]; colours: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-[10px] border-collapse">
        <thead>
          <tr>
            <th className="text-left font-semibold text-gray-500 pr-2 pb-1">Colour</th>
            {freq.map((_, pos) => (
              <th key={pos} className="px-1 pb-1 font-semibold text-gray-500 text-center w-12">#{pos + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PEGS.slice(0, colours).map((p, c) => (
            <tr key={c}>
              <td className="pr-2 py-0.5">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3.5 h-3.5 rounded-full inline-block shrink-0" style={{ background: p.hex }} />
                  <span className="text-gray-700">{p.name}</span>
                </span>
              </td>
              {freq.map((row, pos) => {
                const v = row[c];
                return (
                  <td key={pos} className="px-1 py-0.5">
                    <span className="block rounded-sm text-center tabular-nums"
                      title={`${p.name} in position ${pos + 1}: ${(v * 100).toFixed(1)}% of the codes left`}
                      style={{
                        background: v === 0 ? "#f3f4f6" : `rgba(37, 99, 235, ${0.12 + 0.78 * Math.min(1, v * colours / 1.6)})`,
                        color: v * colours > 1.1 ? "#fff" : "#374151",
                      }}>
                      {v === 0 ? "—" : `${(v * 100).toFixed(0)}%`}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An evenly spaced window onto the survivors — clicking one guesses it. */
function SurvivorList({ candidates, cfg, onPick }: {
  candidates: Uint32Array; cfg: Config; onPick: (c: Code) => void;
}) {
  const shown = useMemo(() => {
    const want = Math.min(60, candidates.length);
    const step = candidates.length / Math.max(1, want);
    const out: Code[] = [];
    for (let i = 0; i < want; i++) {
      let v = candidates[Math.min(candidates.length - 1, Math.floor(i * step))];
      const code = new Array<number>(cfg.length);
      for (let k = cfg.length - 1; k >= 0; k--) { code[k] = v % cfg.colours; v = (v / cfg.colours) | 0; }
      out.push(code);
    }
    return out;
  }, [candidates, cfg]);

  if (candidates.length === 0) {
    return <p className="text-xs text-red-700">None. An answer somewhere must be wrong.</p>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((c, k) => (
        <button key={k} onClick={() => onPick(c)} title={`${codeLabel(c)} — click to load it as your guess`}
          className="px-1 py-0.5 rounded border border-gray-200 hover:border-blue-400 hover:bg-blue-50">
          <CodeRow code={c} size={14} />
        </button>
      ))}
    </div>
  );
}

function Stat({ label, value, unit, strong, title }: {
  label: string; value: string; unit?: string; strong?: boolean; title?: string;
}) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-2 py-1.5" title={title}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <span className={"tabular-nums " + (strong ? "text-base font-semibold text-gray-900" : "text-sm text-gray-900")}>
        {value}
      </span>
      {unit && <span className="text-[10px] text-gray-500 ml-1">{unit}</span>}
    </div>
  );
}

/** Bits found out of bits to find — the only progress bar that is always honest. */
function Progress({ found, total }: { found: number; total: number }) {
  const pct = total > 0 ? Math.max(0, Math.min(100, (100 * found) / total)) : 0;
  return (
    <div>
      <div className="h-2 w-full rounded bg-gray-200 overflow-hidden">
        <div className="h-full bg-blue-600 transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-500 mt-1 tabular-nums">
        {found.toFixed(2)} of {total.toFixed(2)} bits found
      </p>
    </div>
  );
}

function Choice({ label, value, onChange, min, max, swatches = false }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; swatches?: boolean;
}) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">{label}</h3>
      <div className="flex items-center gap-1.5 flex-wrap">
        {Array.from({ length: max - min + 1 }, (_, k) => min + k).map((v) => (
          <button key={v} onClick={() => onChange(v)}
            className={"px-3 py-1.5 rounded border-2 text-sm font-semibold transition-colors " +
              (v === value ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700 hover:border-blue-400")}>
            {v}
          </button>
        ))}
      </div>
      {swatches && (
        <div className="flex gap-1 mt-2">
          {PEGS.slice(0, value).map((p, i) => (
            <span key={i} title={p.name} className="w-5 h-5 rounded-full" style={{ background: p.hex }} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
      <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900">Mastermind</h1>
      <span className="text-xs text-gray-500">every guess is a question · the pegs are the answer · <strong>entropy is what it bought</strong></span>
    </header>
  );
}

function HowItWorks() {
  return (
    <section className="border border-gray-200 rounded-lg p-3 bg-gray-50">
      <h2 className="text-xs font-semibold text-gray-900 mb-1.5">How it works</h2>
      <ol className="text-[11px] text-gray-700 space-y-1 list-decimal list-inside">
        <li>The setter hides a code — pegs drawn from the colours above, <strong>repeats allowed</strong>.</li>
        <li>You guess a whole code. The setter answers with two counts and nothing else:{" "}
          <strong>black</strong> = right colour in the right place, <strong>white</strong> = right colour in
          the wrong place.</li>
        <li>Every guess is really a <strong>question</strong>: it sorts the codes still standing into one
          group per answer it could draw. The answer tells you which group the code is in.</li>
        <li>Shannon&rsquo;s entropy over those group sizes is the <strong>expected number of bits</strong> the
          answer will hand over. Ask the question with the most bits in it and the field collapses fastest.</li>
      </ol>
    </section>
  );
}
