"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  type Cells, type Bounds, cellsFrom, step, packCell, cellX, cellY,
  boundingBox, stabilisation,
} from "@/app/lib/life/engine";
import {
  CONWAY, type Rule, parseRule, formatRule, describeRule, RULE_LIBRARY, isConway,
} from "@/app/lib/life/rules";
import {
  LIFE_PATTERNS, PATTERN_ORDER, CATEGORY_LABEL, CATEGORY_NOTE,
  artToCoords, patternById, patternSize, type LifePattern,
} from "@/app/lib/life/patterns";
import { tonesFor } from "@/app/lib/theme/featureColors";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";

const GRID_CHOICES = [40, 60, 80, 120, 200, 400];
const SPEEDS: { label: string; ms: number }[] = [
  { label: "Slow", ms: 240 }, { label: "Steady", ms: 90 }, { label: "Fast", ms: 30 }, { label: "Flat out", ms: 0 },
];

export function LifeClient() {
  const scheme = useFeatureColors();
  const tone = tonesFor(scheme, "funExtensions");

  const [size, setSize] = useState(80);
  const [rule, setRule] = useState<Rule>(CONWAY);
  const [ruleText, setRuleText] = useState("B3/S23");
  const [cells, setCells] = useState<Cells>(() => new Set<number>());
  const [gen, setGen] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [chosen, setChosen] = useState<string>("glider");
  const [showRules, setShowRules] = useState(true);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const bounds: Bounds = useMemo(() => ({ width: size, height: size }), [size]);

  /** Drop a pattern in the middle of the grid and start again from generation 0. */
  const place = useCallback((p: LifePattern, gridSize: number) => {
    const { width, height } = patternSize(p);
    const ox = Math.max(0, Math.floor((gridSize - width) / 2));
    const oy = Math.max(0, Math.floor((gridSize - height) / 2));
    setCells(cellsFrom(artToCoords(p.art).map(([x, y]) => [x + ox, y + oy] as [number, number])));
    setGen(0);
    setRunning(false);
    setAnalysis(null);
  }, []);

  // Seed with the glider, so the screen is doing something the moment it opens.
  useEffect(() => {
    const p = patternById("glider");
    if (p) place(p, 80);
  }, [place]);

  // The clock. `running` and the speed are the only things it depends on, so
  // changing the rule mid-run takes effect on the very next generation.
  const ruleRef = useRef(rule); ruleRef.current = rule;
  const boundsRef = useRef(bounds); boundsRef.current = bounds;
  useEffect(() => {
    if (!running) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      setCells((c) => step(c, boundsRef.current, ruleRef.current));
      setGen((g) => g + 1);
    };
    const id = window.setInterval(tick, SPEEDS[speed].ms || 16);
    return () => { alive = false; window.clearInterval(id); };
  }, [running, speed]);

  // Everything dead is the end of the run — stopping says so rather than
  // leaving a timer ticking over an empty grid.
  useEffect(() => { if (running && cells.size === 0) setRunning(false); }, [running, cells.size]);

  const applyRule = (text: string) => {
    setRuleText(text);
    const r = parseRule(text);
    if (r) setRule(r);
  };
  const ruleValid = parseRule(ruleText) !== null;

  const one = () => { setCells((c) => step(c, bounds, rule)); setGen((g) => g + 1); };
  const clear = () => { setCells(new Set()); setGen(0); setRunning(false); setAnalysis(null); };
  const reset = () => { const p = patternById(chosen); if (p) place(p, size); };

  /**
   * Run the pattern to its conclusion on an INFINITE plane and report it.
   *
   * Deliberately unbounded, and deliberately not the grid the user is watching:
   * the published figures — the R-pentomino's 1,103 generations, the acorn's
   * 5,206 — are properties of Life, not of a window onto it. On a bounded grid
   * the escaping gliders hit the edge and die, and the answer changes.
   */
  const analyse = () => {
    setBusy(true);
    setAnalysis(null);
    window.setTimeout(() => {
      const r = stabilisation(cells, 30000, rule);
      setAnalysis(r.extinct
        ? `Everything died at generation ${r.generation}. It peaked at ${r.peakPopulation} cells.`
        : r.generation === 0
          ? `Stable from the start — the population never changed. ${r.population} cells.`
          : `The population stopped changing at generation ${r.generation}, leaving ${r.population} cells `
            + `(it peaked at ${r.peakPopulation}). Measured on an infinite plane, not this grid.`);
      setBusy(false);
    }, 10);
  };

  const toggleCell = (x: number, y: number) => {
    setCells((c) => {
      const n = new Set(c);
      const k = packCell(x, y);
      if (n.has(k)) n.delete(k); else n.add(k);
      return n;
    });
  };

  const box = boundingBox(cells);
  const current = patternById(chosen);

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Life</h1>
        <span className="text-xs text-gray-500">
          Conway&rsquo;s Game of Life — and every other rule in B/S notation
        </span>
      </header>

      <main className="max-w-[100rem] mx-auto p-6 grid gap-5 lg:grid-cols-[20rem_1fr] items-start">
        {/* ── The pattern library ──────────────────────────────────────── */}
        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Patterns</h2>
            <p className="text-[11px] text-gray-500 mb-2">
              Every behaviour below is what the pattern does under <strong>Conway&rsquo;s rule</strong>.
              Under another rule it will do something, but not this.
            </p>
            <div className="space-y-3 max-h-[36rem] overflow-y-auto">
              {PATTERN_ORDER.map((cat) => (
                <div key={cat}>
                  <h3 className="text-[11px] font-semibold text-gray-800">{CATEGORY_LABEL[cat]}</h3>
                  <p className="text-[10px] text-gray-500 mb-1">{CATEGORY_NOTE[cat]}</p>
                  <ul className="space-y-1">
                    {LIFE_PATTERNS.filter((p) => p.category === cat).map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => { setChosen(p.id); place(p, size); }}
                          className={"w-full text-left px-2 py-1 rounded border text-[11px] transition-colors "
                            + (chosen === p.id ? "border-transparent" : "border-gray-200 bg-white hover:border-gray-300")}
                          style={chosen === p.id ? { background: tone.bg, color: tone.text, borderColor: tone.text } : undefined}>
                          <span className="font-medium">{p.name}</span>
                          <span className="block text-[10px] text-gray-500 leading-snug">{p.behaviour}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── The grid and its controls ────────────────────────────────── */}
        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => setRunning((r) => !r)} disabled={cells.size === 0 && !running}
                className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
                style={{ background: tone.bg, color: tone.text }}>
                {running ? "Pause" : "Run"}
              </button>
              <button onClick={one} disabled={running}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                Step
              </button>
              <button onClick={reset} disabled={!current}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                Reset
              </button>
              <button onClick={clear}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">
                Clear
              </button>

              <span className="ml-2 text-[11px] text-gray-500">Speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="border border-gray-300 rounded px-1.5 py-1 text-[11px]">
                {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
              </select>

              <span className="ml-2 text-[11px] text-gray-500">Grid</span>
              <select value={size}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setSize(n);
                  const p = patternById(chosen);
                  if (p) place(p, n);
                }}
                className="border border-gray-300 rounded px-1.5 py-1 text-[11px]">
                {GRID_CHOICES.map((n) => <option key={n} value={n}>{n} × {n}</option>)}
              </select>

              <span className="ml-auto text-[11px] text-gray-700 tabular-nums">
                generation <strong>{gen}</strong> · <strong>{cells.size}</strong> live
                {box && <> · {box.width}×{box.height}</>}
              </span>
            </div>

            <LifeGrid cells={cells} size={size} onToggle={toggleCell} tone={tone} />

            <p className="text-[10px] text-gray-500 mt-2">
              Click a cell to bring it to life or kill it. Anything outside the grid is dead —
              the edges do not wrap, so a glider leaving the {size} × {size} window is gone.
            </p>
          </section>

          {/* ── The rule ───────────────────────────────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-baseline justify-between mb-2">
              <h2 className="text-sm font-semibold text-gray-900">The rule</h2>
              <button onClick={() => setShowRules((s) => !s)}
                className="text-[11px] text-blue-600 hover:text-blue-800 underline">
                {showRules ? "Hide" : "Show"} what it means
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input
                value={ruleText}
                onChange={(e) => applyRule(e.target.value)}
                spellCheck={false}
                className={"border rounded px-2 py-1 text-xs font-mono w-32 "
                  + (ruleValid ? "border-gray-300" : "border-red-400 bg-red-50 text-red-800")}
              />
              {!ruleValid && <span className="text-[11px] text-red-700">Not B/S notation — try B3/S23.</span>}
              {ruleValid && !isConway(rule) && (
                <span className="text-[11px] text-amber-700">
                  Not Conway&rsquo;s Life — the library&rsquo;s described behaviour does not apply.
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {RULE_LIBRARY.map((r) => (
                <button key={r.notation} onClick={() => applyRule(r.notation)}
                  title={r.note}
                  className={"px-2 py-0.5 rounded border text-[11px] "
                    + (formatRule(rule) === r.notation ? "border-transparent" : "border-gray-300 bg-white hover:border-gray-400")}
                  style={formatRule(rule) === r.notation ? { background: tone.bg, color: tone.text } : undefined}>
                  {r.name} <span className="opacity-60 font-mono">{r.notation}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              {RULE_LIBRARY.find((r) => r.notation === formatRule(rule))?.note
                ?? "A rule of your own. B lists the neighbour counts that bring a dead cell to life; S lists those a live cell survives."}
            </p>

            {showRules && (
              <ol className="space-y-1 border-t border-gray-100 pt-2">
                {describeRule(rule).map((r) => (
                  <li key={r.n} className="text-[11px] text-gray-700">
                    <span className="text-gray-400 mr-1">{r.n}.</span>
                    {r.when} <strong>{r.then}</strong>
                    <span className="text-gray-400"> — {r.name}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* ── Run it out ─────────────────────────────────────────────── */}
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2">
              <button onClick={analyse} disabled={busy || cells.size === 0}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                {busy ? "Running…" : "Run it out"}
              </button>
              <span className="text-[11px] text-gray-500">
                Runs up to 30,000 generations on an infinite plane and reports when it settles.
              </span>
            </div>
            {analysis && <p className="text-[11px] text-gray-800 mt-2">{analysis}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}

/**
 * The grid.
 *
 * Drawn to a canvas rather than as elements: a 400 × 400 grid is 160,000 cells,
 * and 160,000 DOM nodes re-rendered thirty times a second is not a thing a
 * browser will do. The canvas draws only the LIVE cells, so the cost follows the
 * population, exactly as the engine does.
 */
function LifeGrid({ cells, size, onToggle, tone }: {
  cells: Cells; size: number; onToggle: (x: number, y: number) => void;
  tone: { bg: string; text: string };
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const PX = 720;                                     // drawing surface, square

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const scale = PX / size;
    ctx.clearRect(0, 0, PX, PX);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, PX, PX);

    // The lattice, only while the cells are big enough for it to read as a grid
    // rather than as grey.
    if (scale >= 6) {
      ctx.strokeStyle = "#eef2f7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= size; i++) {
        const p = Math.round(i * scale) + 0.5;
        ctx.moveTo(p, 0); ctx.lineTo(p, PX);
        ctx.moveTo(0, p); ctx.lineTo(PX, p);
      }
      ctx.stroke();
    }

    ctx.fillStyle = tone.text;
    const pad = scale >= 6 ? 1 : 0;
    for (const k of cells) {
      const x = cellX(k), y = cellY(k);
      if (x < 0 || y < 0 || x >= size || y >= size) continue;   // off-grid is dead
      ctx.fillRect(x * scale + pad, y * scale + pad, Math.max(1, scale - pad * 2), Math.max(1, scale - pad * 2));
    }
    ctx.strokeStyle = "#cbd5e1";
    ctx.strokeRect(0.5, 0.5, PX - 1, PX - 1);
  }, [cells, size, tone.text]);

  const click = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = ref.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * size);
    const y = Math.floor(((e.clientY - r.top) / r.height) * size);
    if (x >= 0 && y >= 0 && x < size && y < size) onToggle(x, y);
  };

  return (
    <canvas
      ref={ref} width={PX} height={PX} onClick={click}
      className="w-full max-w-[720px] aspect-square cursor-crosshair rounded border border-gray-200"
    />
  );
}

