"use client";

/**
 * n × n Nimb — an explorer for a two-player misère placement game.
 *
 *   1. Choose n (2–4).
 *   2. A turn places 1–4 ✕ on CONSECUTIVE empty squares in one row or column.
 *   3. No passing.
 *   4. Whoever places the LAST ✕ loses.
 *
 * Beside the board: every **genuinely different** move for the player to move —
 * rotations and reflections of each other collapsed into one — split into a
 * WINNING column and a LOSING column. Select any of them and a third panel
 * shows every distinct reply the opponent would then have, coloured the same
 * way. That second ply is where the game explains itself: a winning move is
 * exactly one whose replies are *all* red.
 *
 * All the rules, the solver and the symmetry reduction live in
 * `app/lib/games/nimb.ts`; this file is interaction and presentation only.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  type Board, type MoveOption, type Shape,
  isFilled, distinctMoves, legalMoves, winning, emptyCount,
  isLegalSelection, MAX_RUN, groupedShapes, shapeName,
  type MoveClass, moveClasses, strategyAdvice,
} from "@/app/lib/games/nimb";

type Player = 1 | 2;
interface Ply { board: Board; turn: Player; label: string }

const MAX_N = 4;

/** "2 ✕ in row 1, from col 1" — the move in words. */
function describe(o: MoveOption): string {
  const m = o.move;
  const where = m.orientation === "row" ? `row ${m.line + 1}` : `column ${m.line + 1}`;
  const from = m.orientation === "row" ? `col ${m.start + 1}` : `row ${m.start + 1}`;
  return `${m.length} ✕ in ${where}, from ${from}`;
}

export function NimbClient() {
  const [started, setStarted] = useState(false);
  const [n, setN] = useState(3);
  const [board, setBoard] = useState<Board>(0);
  const [turn, setTurn] = useState<Player>(1);
  const [history, setHistory] = useState<Ply[]>([]);
  const [hover, setHover] = useState<number[] | null>(null);
  /** The move whose replies are on show — canonical key, so it survives a
   *  re-render without holding a stale object. */
  const [selKey, setSelKey] = useState<Board | null>(null);
  /** Squares picked directly on the board — how ANY concrete move is played,
   *  including one the symmetry-reduced list does not offer. */
  const [sel, setSel] = useState<number[]>([]);

  const options = useMemo<MoveOption[]>(() => (started ? distinctMoves(board, n) : []), [started, board, n]);
  const allLegal = useMemo(() => (started ? legalMoves(board, n).length : 0), [started, board, n]);
  const wins = useMemo(() => options.filter((o) => o.wins), [options]);
  const loses = useMemo(() => options.filter((o) => !o.wins), [options]);

  const selected = useMemo(() => options.find((o) => o.key === selKey) ?? null, [options, selKey]);
  /** The opponent's distinct replies to the selected move — the second ply. */
  const replies = useMemo<MoveOption[]>(
    () => (selected ? distinctMoves(selected.result, n) : []),
    [selected, n],
  );

  const over = started && options.length === 0;
  /** Misère: the opponent just placed the last ✕, so the player to move wins. */
  const winner: Player | null = over ? turn : null;
  const toMoveWins = useMemo(() => (started && !over ? winning(board, n) : null), [started, over, board, n]);

  const play = useCallback((o: MoveOption) => {
    setHistory((h) => [...h, { board, turn, label: describe(o) }]);
    setBoard(o.result);
    setTurn(turn === 1 ? 2 : 1);
    setHover(null); setSelKey(null); setSel([]);
  }, [board, turn]);

  const undo = useCallback(() => {
    setHistory((h) => {
      if (!h.length) return h;
      const last = h[h.length - 1];
      setBoard(last.board); setTurn(last.turn); setHover(null); setSelKey(null); setSel([]);
      return h.slice(0, -1);
    });
  }, []);

  const restart = useCallback(() => { setBoard(0); setTurn(1); setHistory([]); setHover(null); setSelKey(null); setSel([]); }, []);

  const selValid = sel.length > 0 && isLegalSelection(board, n, sel);
  /** Verdict for the hand-picked selection, so the board tells you what the
   *  list would have. */
  const selVerdict = useMemo(() => {
    if (!selValid) return null;
    const after = sel.reduce((b, i) => b | (1 << i), board);
    return !winning(after, n);
  }, [selValid, sel, board, n]);

  /** Click behaviour: extend the run when this square legally extends it, else
   *  start a new run here. Never a dead click on an empty square. */
  const clickCell = useCallback((i: number) => {
    if (over || isFilled(board, i)) return;
    setHover(null); setSelKey(null);
    setSel((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i);
      const next = [...cur, i].sort((a, z) => a - z);
      return next.length <= MAX_RUN && isLegalSelection(board, n, next) ? next : [i];
    });
  }, [board, n, over]);

  /** Play one representative of a class — every member has the same value, so
   *  which one is arbitrary. */
  const playClass = useCallback((c: MoveClass) => {
    const m = c.example;
    const label = `${m.length} ✕ in ${m.orientation === "row" ? "row" : "column"} ${m.line + 1}, from ${m.orientation === "row" ? "col" : "row"} ${m.start + 1}`;
    setHistory((h) => [...h, { board, turn, label }]);
    setBoard(board | m.mask);
    setTurn(turn === 1 ? 2 : 1);
    setSel([]); setHover(null); setSelKey(null);
  }, [board, turn]);

  const playSelection = useCallback(() => {
    if (!selValid) return;
    const after = sel.reduce((b, i) => b | (1 << i), board);
    const cells = [...sel].sort((a, z) => a - z);
    const rowSpan = new Set(cells.map((i) => Math.floor(i / n))).size === 1;
    const line = rowSpan ? Math.floor(cells[0] / n) : cells[0] % n;
    const start = rowSpan ? cells[0] % n : Math.floor(cells[0] / n);
    const label = `${cells.length} ✕ in ${rowSpan ? "row" : "column"} ${line + 1}, from ${rowSpan ? "col" : "row"} ${start + 1}`;
    setHistory((h) => [...h, { board, turn, label }]);
    setBoard(after);
    setTurn(turn === 1 ? 2 : 1);
    setSel([]); setHover(null); setSelKey(null);
  }, [selValid, sel, board, n, turn]);

  /** The independent regions of empty squares — each an independent game. */
  const shapes = useMemo(() => (started ? groupedShapes(board, n) : []), [started, board, n]);
  /** Distinct IDEAS available, and the safe rules describing the winning ones. */
  const classes = useMemo(() => (started && !over ? moveClasses(board, n) : []), [started, over, board, n]);
  const advice = useMemo(() => (started && !over ? strategyAdvice(board, n) : []), [started, over, board, n]);

  /** Highlight EVERY square a class could be played on — so "anywhere in the
   *  4×1" can actually show the anywhere rather than assert it. */
  const highlightClass = useCallback((c: MoveClass | null) => {
    if (!c) { setHover(null); return; }
    const cells = new Set<number>();
    for (const m of c.memberMasks) for (let i = 0; i < n * n; i++) if (m & (1 << i)) cells.add(i);
    setHover([...cells]);
  }, [n]);

  if (!started) {
    return (
      <div className="min-h-screen dgx-dashboard-bg">
        <Header />
        <main className="max-w-xl mx-auto p-6">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-6">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Choose the board size</h2>
            <p className="text-xs text-gray-600 mb-4">
              An <strong>n × n</strong> grid. Solving is exhaustive, so every move can be
              labelled winning or losing — which is why n stops at {MAX_N}
              ({MAX_N * MAX_N} squares ≈ 65,000 positions).
            </p>
            <div className="flex items-center gap-2 mb-5">
              {[2, 3, 4].map((k) => (
                <button key={k} onClick={() => setN(k)}
                  className={"w-16 h-16 rounded-lg border-2 text-lg font-semibold transition-colors " +
                    (n === k ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-300 text-gray-700 hover:border-blue-400")}>
                  {k}×{k}
                </button>
              ))}
            </div>
            <button onClick={() => { restart(); setStarted(true); }}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700">
              Start — Player 1 to move
            </button>
            <Rules className="mt-6" />
          </section>
        </main>
      </div>
    );
  }

  const cellSize = n === 2 ? 72 : n === 3 ? 64 : 56;
  const opponent: Player = turn === 1 ? 2 : 1;

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <Header />
      <main className="max-w-[90rem] mx-auto p-6 grid gap-5 lg:grid-cols-[auto_1fr_1fr] items-start">
        {/* ── Board ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          {/* The board is playable directly. The move LIST offers one
              representative per symmetry class, so "4 ✕ in column 3" is absent
              when "4 ✕ in row 2" stands for it — the same game, but not the
              move someone wanted to make. Clicking the squares lets any
              concrete move be played. */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 inline-block">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, ${cellSize}px)` }}>
              {Array.from({ length: n * n }, (_, i) => {
                const filled = isFilled(board, i);
                const preview = hover?.includes(i) ?? false;
                const picked = sel.includes(i);
                const chosen = !preview && !picked && (selected?.move.cells.includes(i) ?? false);
                return (
                  <button
                    key={i}
                    onClick={() => clickCell(i)}
                    disabled={filled || over}
                    aria-label={`row ${Math.floor(i / n) + 1}, column ${(i % n) + 1}${filled ? " — filled" : ""}`}
                    style={{ width: cellSize, height: cellSize }}
                    className={"flex items-center justify-center rounded border-2 text-2xl font-bold transition-colors " +
                      (filled ? "bg-gray-800 border-gray-800 text-white cursor-default"
                        : picked ? "bg-blue-600 border-blue-700 text-white"
                        : preview ? "bg-blue-100 border-blue-500 text-blue-600"
                        : chosen ? "bg-blue-50 border-blue-300 text-blue-400"
                        : "bg-white border-gray-200 text-transparent hover:border-blue-300 hover:bg-blue-50")}>
                    ✕
                  </button>
                );
              })}
            </div>
            {!over && (
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={playSelection}
                  disabled={!selValid}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-300"
                  title={selValid ? `Play these ${sel.length} for Player ${turn}` : "Click 1–4 consecutive empty squares in one row or column"}
                >
                  {sel.length ? `Play ${sel.length} ✕` : "Or click squares to play any move"}
                </button>
                {sel.length > 0 && (
                  <>
                    <button onClick={() => setSel([])}
                      className="px-2.5 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Clear</button>
                    {!selValid && <span className="text-[11px] text-red-600">not a legal run</span>}
                    {selValid && selVerdict !== null && (
                      <span className={"text-[11px] font-semibold " + (selVerdict ? "text-green-700" : "text-red-700")}>
                        {selVerdict ? "winning move" : "losing move"}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-3">
            {over ? (
              <p className="text-sm">
                <span className="font-semibold text-green-700">Player {winner} wins.</span>{" "}
                <span className="text-gray-600">Player {winner === 1 ? 2 : 1} placed the last ✕.</span>
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-900">
                  <span className="font-semibold">Player {turn}</span> to move —{" "}
                  {toMoveWins ? <span className="text-green-700 font-medium">winning position</span>
                              : <span className="text-red-700 font-medium">losing position</span>}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                  {options.length} distinct of {allLegal} legal · {emptyCount(board, n)} squares empty
                </p>
              </>
            )}
          </section>

          <div className="flex gap-2">
            <button onClick={undo} disabled={!history.length}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50 disabled:opacity-40">Undo</button>
            <button onClick={restart}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">Restart</button>
            <button onClick={() => setStarted(false)}
              className="px-3 py-1.5 text-xs border border-gray-300 rounded bg-white hover:bg-gray-50">Change size</button>
          </div>

          {history.length > 0 && (
            <ol className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 text-[11px] text-gray-600 space-y-0.5 list-decimal list-inside">
              {history.map((h, k) => <li key={k}>P{h.turn}: {h.label}</li>)}
            </ol>
          )}
        </div>

        {/* ── Strategy, shapes + moves ──────────────────────────── */}
        <div className="space-y-4">
        {!over && (
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">Strategy for Player {turn}</h2>
            {advice.length > 0 ? (
              <>
                <ul className="mt-2 space-y-1">
                  {advice.map((a, k) => (
                    <li key={k} className="text-xs text-green-900 bg-green-50 border border-green-300 rounded px-2.5 py-1.5">{a}</li>
                  ))}
                </ul>
                <p className="text-[11px] text-gray-500 mt-2">
                  Each rule is stated only when EVERY move it covers wins — a memorable rule that
                  loses games would be worse than a fussy one that does not.
                </p>
              </>
            ) : (
              <p className="mt-2 text-xs text-red-900 bg-red-50 border border-red-300 rounded px-2.5 py-1.5 font-semibold">
                No winning move exists. You have already lost against perfect play.
              </p>
            )}
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mt-4 mb-1.5">
              Distinct ideas ({classes.length})
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {classes.map((c) => (
                <li key={c.key}>
                  <button
                    onClick={() => playClass(c)}
                    onMouseEnter={() => highlightClass(c)}
                    onMouseLeave={() => highlightClass(null)}
                    className={"flex items-center gap-2 px-2 py-1.5 rounded border text-[11px] transition-colors " +
                      (c.wins ? "border-green-400 bg-green-50 hover:bg-green-100 text-green-900"
                              : "border-red-300 bg-red-50 hover:bg-red-100 text-red-900")}
                    title={`${c.count} placement${c.count === 1 ? "" : "s"} on the board — click to play one`}
                  >
                    <ClassGlyph c={c} />
                    <span>
                      <span className="font-medium">{c.length} in {shapeName(c.shape)}</span>
                      {c.where && <span className="text-gray-600"> · {c.where}</span>}
                      <span className="text-gray-400"> · ×{c.count}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!over && (
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900">Remaining shapes</h2>
            <p className="text-[11px] text-gray-500 mb-3">
              The empty squares split into regions no single move can span, so each is an
              INDEPENDENT game — and <em>where</em> a shape sits stops mattering. Shown in
              canonical form: one drawing stands for every rotation and reflection of it.
            </p>
            <div className="flex flex-wrap gap-3">
              {shapes.map(({ shape, count }) => (
                <div key={shape.key} className="flex items-center gap-2 px-2.5 py-2 rounded border border-gray-200 bg-gray-50">
                  <ShapeGlyph shape={shape} />
                  <span className="text-[11px] text-gray-800">
                    {count > 1 && <span className="font-semibold">{count} × </span>}
                    <span className="font-medium">{shapeName(shape)}</span>
                    <span className="text-gray-500"> · {shape.size} sq</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              {shapes.length} region{shapes.length === 1 ? "" : "s"} ·{" "}
              {shapes.reduce((t, g) => t + g.count * g.shape.size, 0)} squares empty
            </p>
          </section>
        )}

        {/* ── This player's moves, split by verdict ─────────────── */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900">Moves for Player {turn}</h2>
          <p className="text-[11px] text-gray-500 mb-3">
            You choose for BOTH players. Click a move to see it on the board and list the replies; press Play to make it — including a losing one, deliberately.
          </p>
          {over ? <p className="text-xs text-gray-500">No moves — the board is full.</p> : (
            <>
              {/* Said once, plainly, at the top. An empty "Winning" column is
                  technically the same information and reads as a rendering
                  glitch; the position being already lost is the single most
                  useful thing to know and deserves stating. */}
              {wins.length === 0 && (
                <p className="mb-3 px-3 py-2 rounded border border-red-300 bg-red-50 text-red-900 text-xs font-semibold">
                  You have already lost. Every move loses against perfect play —
                  play on and hope Player {opponent} errs.
                </p>
              )}
              <div className={"grid gap-3 " + (wins.length === 0 ? "" : "sm:grid-cols-2")}>
                {wins.length > 0 && (
                  <MoveColumn
                    title={`Winning (${wins.length})`} tone="win" moves={wins} n={n} board={board}
                    selKey={selKey} onSelect={setSelKey} onPlay={play} onHover={setHover} player={turn}
                    empty=""
                  />
                )}
                <MoveColumn
                  title={wins.length === 0 ? `All moves lose (${loses.length})` : `Losing (${loses.length})`}
                  tone="lose" moves={loses} n={n} board={board}
                  selKey={selKey} onSelect={setSelKey} onPlay={play} onHover={setHover} player={turn}
                  empty="Every move here wins."
                />
              </div>
            </>
          )}
        </section>
        </div>

        {/* ── The opponent's replies to the selected move ───────── */}
        <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
          <h2 className="text-sm font-semibold text-gray-900">Player {opponent}&rsquo;s replies</h2>
          {!selected ? (
            <p className="text-[11px] text-gray-500 mt-1">
              Select one of Player {turn}&rsquo;s moves to see every distinct reply it allows.
            </p>
          ) : (
            <>
              <p className="text-[11px] text-gray-500 mt-1 mb-3">
                After <strong className={selected.wins ? "text-green-700" : "text-red-700"}>{describe(selected)}</strong>
                {replies.length === 0
                  ? " the board is full — Player " + opponent + " cannot move, so Player " + turn + " placed the last ✕ and loses."
                  : selected.wins
                    ? <> — all {replies.length} replies lose, which is <em>why</em> this move wins.</>
                    : <> — Player {opponent} has {replies.filter((r) => r.wins).length} winning repl{replies.filter((r) => r.wins).length === 1 ? "y" : "ies"}.</>}
              </p>
              {replies.length > 0 && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <MoveColumn
                    title={`Winning for P${opponent} (${replies.filter((r) => r.wins).length})`} tone="win"
                    moves={replies.filter((r) => r.wins)} n={n} board={selected.result}
                    selKey={null} onSelect={() => {}} onPlay={() => {}} onHover={() => {}} player={opponent} readOnly
                    empty="None — every reply loses."
                  />
                  <MoveColumn
                    title={`Losing for P${opponent} (${replies.filter((r) => !r.wins).length})`} tone="lose"
                    moves={replies.filter((r) => !r.wins)} n={n} board={selected.result}
                    selKey={null} onSelect={() => {}} onPlay={() => {}} onHover={() => {}} player={opponent} readOnly
                    empty="None — every reply wins."
                  />
                </div>
              )}
            </>
          )}
          <Rules className="mt-4" />
        </section>
      </main>
    </div>
  );
}

function MoveColumn({
  title, tone, moves, n, board, selKey, onSelect, onPlay, onHover, empty, player, readOnly = false,
}: {
  title: string; tone: "win" | "lose"; moves: MoveOption[]; n: number; board: Board;
  selKey: Board | null; onSelect: (k: Board) => void; onPlay: (o: MoveOption) => void;
  onHover: (c: number[] | null) => void; empty: string; player: number; readOnly?: boolean;
}) {
  const head = tone === "win" ? "text-green-700" : "text-red-700";
  const box = tone === "win"
    ? "border-green-400 bg-green-50 text-green-900 hover:bg-green-100"
    : "border-red-300 bg-red-50 text-red-900 hover:bg-red-100";
  return (
    <div>
      <h3 className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${head}`}>{title}</h3>
      {moves.length === 0 ? (
        <p className="text-[11px] text-gray-400 italic">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {moves.map((o) => {
            const isSel = selKey === o.key;
            return (
              // Inspect and play are SEPARATE controls. They were one button
              // where the first click selected and the second played, which is
              // a gesture nobody discovers — and it made playing a move you can
              // see is losing feel like a mis-click rather than a choice.
              <li key={o.key} className={`flex items-stretch gap-1 rounded border ${box}` + (isSel ? " ring-2 ring-blue-500" : "")}>
                <button
                  onClick={() => { if (!readOnly) onSelect(o.key); }}
                  onMouseEnter={() => onHover(o.move.cells)}
                  onMouseLeave={() => onHover(null)}
                  disabled={readOnly}
                  className={"flex-1 flex items-center justify-between gap-2 px-2.5 py-1.5 text-left text-[11px] rounded-l" + (readOnly ? " cursor-default" : "")}
                  title={readOnly ? undefined : "Show this move on the board and list the replies"}
                >
                  <span className="font-medium">{describe(o)}</span>
                  <MiniBoard n={n} before={board} cells={o.move.cells} />
                </button>
                {!readOnly && (
                  <button
                    onClick={() => onPlay(o)}
                    onMouseEnter={() => onHover(o.move.cells)}
                    onMouseLeave={() => onHover(null)}
                    className="px-2 text-[10px] font-semibold uppercase tracking-wide border-l border-black/10 hover:bg-black/5 rounded-r"
                    title={`Play this move for Player ${player} — you may pick a losing move deliberately`}
                  >
                    Play ▸
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** A shape drawn in its canonical form — the geometry is the point, since two
 *  shapes with the same square count can play completely differently. */
function ShapeGlyph({ shape }: { shape: Shape }) {
  const px = shape.rows > 4 || shape.cols > 4 ? 9 : 13;
  return (
    <span className="grid gap-px shrink-0" style={{ gridTemplateColumns: `repeat(${shape.cols}, ${px}px)` }}>
      {Array.from({ length: shape.rows * shape.cols }, (_, k) => {
        const r = Math.floor(k / shape.cols), c = k % shape.cols;
        const on = shape.cells.some(([a, b]) => a === r && b === c);
        return <span key={k} style={{ width: px, height: px }}
          className={on ? "bg-white border border-gray-400 rounded-[1px]" : ""} />;
      })}
    </span>
  );
}

/** The shape with this move's squares filled in — the idea, drawn. */
function ClassGlyph({ c }: { c: MoveClass }) {
  const px = c.shape.rows > 4 || c.shape.cols > 4 ? 7 : 10;
  return (
    <span className="grid gap-px shrink-0" style={{ gridTemplateColumns: `repeat(${c.shape.cols}, ${px}px)` }}>
      {Array.from({ length: c.shape.rows * c.shape.cols }, (_, k) => {
        const r = Math.floor(k / c.shape.cols), col = k % c.shape.cols;
        const inShape = c.shape.cells.some(([a, b]) => a === r && b === col);
        const inRun = c.cellsInShape.some(([a, b]) => a === r && b === col);
        return <span key={k} style={{ width: px, height: px }}
          className={inRun ? "bg-current rounded-[1px]" : inShape ? "bg-white border border-gray-400 rounded-[1px]" : ""} />;
      })}
    </span>
  );
}

function Header() {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
      <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
      <h1 className="text-lg font-semibold text-gray-900">n × n Nimb</h1>
      <span className="text-xs text-gray-500">1–4 in a line · no passing · <strong>last ✕ loses</strong></span>
    </header>
  );
}

/** Thumbnail of the position a move leads to: squares already filled in grey,
 *  the move's own squares in its verdict colour. Two moves that read alike in
 *  words are instantly distinguishable here. */
function MiniBoard({ n, before, cells }: { n: number; before: Board; cells: number[] }) {
  const px = 7;
  return (
    <span className="grid gap-px shrink-0" style={{ gridTemplateColumns: `repeat(${n}, ${px}px)` }}>
      {Array.from({ length: n * n }, (_, i) => (
        <span key={i} style={{ width: px, height: px }}
          className={"rounded-[1px] " + (cells.includes(i) ? "bg-current" : isFilled(before, i) ? "bg-gray-400" : "bg-gray-200")} />
      ))}
    </span>
  );
}

function Rules({ className = "" }: { className?: string }) {
  return (
    <section className={"border border-gray-200 rounded-lg p-3 bg-gray-50 " + className}>
      <h2 className="text-xs font-semibold text-gray-900 mb-1.5">Rules</h2>
      <ol className="text-[11px] text-gray-700 space-y-0.5 list-decimal list-inside">
        <li>An n × n grid of empty squares.</li>
        <li>A turn places <strong>1–4 ✕</strong> on <strong>consecutive empty</strong> squares in one row <em>or</em> one column.</li>
        <li>No player may pass.</li>
        <li>Whoever places the <strong>last ✕ loses</strong>.</li>
      </ol>
    </section>
  );
}
