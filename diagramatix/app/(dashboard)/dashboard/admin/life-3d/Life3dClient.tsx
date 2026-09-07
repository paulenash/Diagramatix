"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";
import {
  type Cells3, type Neighbourhood, cells3From, step3, boundingBox3, fate3,
  x3, y3, z3, NEIGHBOUR_COUNT,
} from "@/app/lib/life/engine3d";
import {
  BAYS_6567, RULE_3D_LIBRARY, parseRule3d, formatRule3d, describeRule3d, sameRule3d,
} from "@/app/lib/life/rules3d";
import type { Rule } from "@/app/lib/life/rules";
import {
  LIFE_3D_PATTERNS, PATTERN_3D_ORDER, CATEGORY_3D_LABEL, CATEGORY_3D_NOTE,
  pattern3dById, pattern3dSize, randomSoup3, type Life3dPattern,
} from "@/app/lib/life/patterns3d";
import { tonesFor } from "@/app/lib/theme/featureColors";
import { useFeatureColors } from "@/app/lib/theme/useFeatureColors";

const SIZES = [20, 40, 60, 100];
const SPEEDS = [
  { label: "Slow", ms: 400 }, { label: "Steady", ms: 160 }, { label: "Fast", ms: 60 },
];

export function Life3dClient() {
  const scheme = useFeatureColors();
  const tone = tonesFor(scheme, "funExtensions");

  const [size, setSize] = useState(40);
  const [rule, setRule] = useState<Rule>(BAYS_6567);
  const [ruleText, setRuleText] = useState("B6/S567");
  const [hood, setHood] = useState<Neighbourhood>("moore");
  const [cells, setCells] = useState<Cells3>(() => new Set<number>());
  const [gen, setGen] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [chosen, setChosen] = useState("glider");
  const [slice, setSlice] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);

  const place = useCallback((p: Life3dPattern, gridSize: number) => {
    const s = pattern3dSize(p);
    const o = (n: number) => Math.max(0, Math.floor((gridSize - n) / 2));
    const [ox, oy, oz] = [o(s.width), o(s.height), o(s.depth)];
    setCells(cells3From(p.cells.map(([x, y, z]) => [x + ox, y + oy, z + oz] as [number, number, number])));
    setGen(0); setRunning(false); setVerdict(null);
    // A pattern is described under ONE rule and does nothing like it under
    // another, so choosing one selects its rule too rather than leaving the
    // screen quietly contradicting the description beside it.
    const r = parseRule3d(p.rule);
    if (r) { setRule(r); setRuleText(p.rule); }
  }, []);

  useEffect(() => { const p = pattern3dById("glider"); if (p) place(p, 40); }, [place]);

  const ruleRef = useRef(rule); ruleRef.current = rule;
  const sizeRef = useRef(size); sizeRef.current = size;
  const hoodRef = useRef(hood); hoodRef.current = hood;
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setCells((c) => step3(c, ruleRef.current, { size: sizeRef.current }, hoodRef.current));
      setGen((g) => g + 1);
    }, SPEEDS[speed].ms);
    return () => window.clearInterval(id);
  }, [running, speed]);

  useEffect(() => { if (running && cells.size === 0) setRunning(false); }, [running, cells.size]);

  const applyRule = (text: string) => {
    setRuleText(text);
    const r = parseRule3d(text);
    if (r) setRule(r);
  };
  const ruleValid = parseRule3d(ruleText) !== null;

  const one = () => { setCells((c) => step3(c, rule, { size }, hood)); setGen((g) => g + 1); };
  const clear = () => { setCells(new Set()); setGen(0); setRunning(false); setVerdict(null); };
  const reset = () => { const p = pattern3dById(chosen); if (p) place(p, size); };
  const soup = () => {
    const box = Math.max(4, Math.round(size / 4));
    const o = Math.floor((size - box) / 2);
    setCells(cells3From(randomSoup3(box).map(([x, y, z]) => [x + o, y + o, z + o] as [number, number, number])));
    setGen(0); setRunning(false); setVerdict(null);
  };

  /**
   * Run it out and say what it turned out to be.
   *
   * This is Bays' criterion, made clickable: a rule deserves the name of Life if
   * a soup settles into stillness, oscillation and moving things rather than
   * simply expanding. Try it on B6/S567 and then on B3/S23.
   */
  const classify = () => {
    const f = fate3(cells, rule, 300, hood);
    setVerdict(
      f.kind === "extinct" ? `Everything died at generation ${f.generation}. It peaked at ${f.peakPopulation} cubes.`
      : f.kind === "still" ? `A still life — unchanged from generation ${f.generation}. ${f.population} cubes.`
      : f.kind === "oscillator" ? `An oscillator of period ${f.period}, from generation ${f.generation}. ${f.population} cubes.`
      : f.kind === "spaceship" ? `A GLIDER: period ${f.period}, moving (${f.displacement!.join(", ")}) each time. ${f.population} cubes.`
      : `Still going after 300 generations — ${f.population} cubes, peaked at ${f.peakPopulation}. Under this rule a soup expands rather than settling.`,
    );
  };

  const box = boundingBox3(cells);
  const nbrs = NEIGHBOUR_COUNT[hood];

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard/admin" className="text-sm text-blue-600 hover:text-blue-800 underline">← SuperAdmin</Link>
        <h1 className="text-lg font-semibold text-gray-900">Life in 3-D</h1>
        <span className="text-xs text-gray-500">
          An infinite cubic lattice — {nbrs} neighbours, and a rule you can change
        </span>
      </header>

      <main className="max-w-[100rem] mx-auto p-6 grid gap-5 lg:grid-cols-[20rem_1fr] items-start">
        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Patterns</h2>
            <p className="text-[11px] text-gray-500 mb-2">
              Every one was <strong>found by searching</strong>, not remembered — its period and
              travel are measured. Choosing one also selects the rule it was found under.
            </p>
            <div className="space-y-3">
              {PATTERN_3D_ORDER.map((cat) => (
                <div key={cat}>
                  <h3 className="text-[11px] font-semibold text-gray-800">{CATEGORY_3D_LABEL[cat]}</h3>
                  <p className="text-[10px] text-gray-500 mb-1">{CATEGORY_3D_NOTE[cat]}</p>
                  <ul className="space-y-1">
                    {LIFE_3D_PATTERNS.filter((p) => p.category === cat).map((p) => (
                      <li key={p.id}>
                        <button onClick={() => { setChosen(p.id); place(p, size); }}
                          className={"w-full text-left px-2 py-1 rounded border text-[11px] transition-colors "
                            + (chosen === p.id ? "border-transparent" : "border-gray-200 bg-white hover:border-gray-300")}
                          style={chosen === p.id ? { background: tone.bg, color: tone.text, borderColor: tone.text } : undefined}>
                          <span className="font-medium">{p.name}</span>
                          <span className="ml-1 font-mono text-[9px] opacity-60">{p.rule}</span>
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

        <div className="space-y-3">
          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <button onClick={() => setRunning((r) => !r)} disabled={cells.size === 0 && !running}
                className="px-3 py-1.5 text-xs font-medium rounded disabled:opacity-50"
                style={{ background: tone.bg, color: tone.text }}>
                {running ? "Pause" : "Run"}
              </button>
              <button onClick={one} disabled={running}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">Step</button>
              <button onClick={reset}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Reset</button>
              <button onClick={soup}
                title="Fill a small box at random. Bays' test for a 3-D rule: does a soup settle, or expand for ever?"
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Random soup</button>
              <button onClick={clear}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Clear</button>

              <span className="ml-2 text-[11px] text-gray-500">Speed</span>
              <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
                className="border border-gray-300 rounded px-1.5 py-1 text-[11px]">
                {SPEEDS.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
              </select>

              <span className="ml-2 text-[11px] text-gray-500">Cube</span>
              <select value={size}
                onChange={(e) => { const n = Number(e.target.value); setSize(n); setSlice(null); const p = pattern3dById(chosen); if (p) place(p, n); }}
                className="border border-gray-300 rounded px-1.5 py-1 text-[11px]">
                {SIZES.map((n) => <option key={n} value={n}>{n}³</option>)}
              </select>

              <span className="ml-auto text-[11px] text-gray-700 tabular-nums">
                generation <strong>{gen}</strong> · <strong>{cells.size}</strong> live
                {box && <> · {box.width}×{box.height}×{box.depth}</>}
              </span>
            </div>

            <LatticeView cells={cells} size={size} colour={tone.text} slice={slice} />

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <label className="flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={slice !== null}
                  onChange={(e) => setSlice(e.target.checked ? Math.floor(size / 2) : null)}
                  className="h-3 w-3 accent-violet-600" />
                Slice through it
              </label>
              {slice !== null && (
                <>
                  <input type="range" min={0} max={size - 1} value={slice}
                    onChange={(e) => setSlice(Number(e.target.value))} className="w-56 accent-violet-600" />
                  <span className="text-[11px] text-gray-600 tabular-nums">z = {slice}</span>
                </>
              )}
              <span className="ml-auto text-[10px] text-gray-500">Drag to rotate · scroll to zoom</span>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">The rule</h2>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <input value={ruleText} onChange={(e) => applyRule(e.target.value)} spellCheck={false}
                className={"border rounded px-2 py-1 text-xs font-mono w-40 "
                  + (ruleValid ? "border-gray-300" : "border-red-400 bg-red-50 text-red-800")} />
              {!ruleValid && <span className="text-[11px] text-red-700">Not B/S notation — try B6/S567, or B6/S5-7.</span>}
              <label className="ml-2 flex items-center gap-1 text-[11px] text-gray-700 cursor-pointer">
                <input type="checkbox" checked={hood === "faces"}
                  onChange={(e) => setHood(e.target.checked ? "faces" : "moore")}
                  className="h-3 w-3 accent-violet-600" />
                Only the 6 face-sharing neighbours
              </label>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-2">
              {RULE_3D_LIBRARY.map((r) => (
                <button key={r.notation} onClick={() => applyRule(r.notation)} title={r.note}
                  className={"px-2 py-0.5 rounded border text-[11px] "
                    + (sameRule3d(rule, parseRule3d(r.notation)!) ? "border-transparent" : "border-gray-300 bg-white hover:border-gray-400")}
                  style={sameRule3d(rule, parseRule3d(r.notation)!) ? { background: tone.bg, color: tone.text } : undefined}>
                  {r.name} <span className="opacity-60 font-mono">{r.notation}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-gray-500 mb-2">
              {RULE_3D_LIBRARY.find((r) => sameRule3d(rule, parseRule3d(r.notation)!))?.note
                ?? `A rule of your own — ${formatRule3d(rule)}. Counts run 0 to ${nbrs}, so write anything above 9 as a list or a range: B12,14/S10-16.`}
            </p>

            <ol className="space-y-1 border-t border-gray-100 pt-2">
              {describeRule3d(rule, nbrs).map((r) => (
                <li key={r.n} className="text-[11px] text-gray-700">
                  <span className="text-gray-400 mr-1">{r.n}.</span>{r.when} <strong>{r.then}</strong>
                </li>
              ))}
            </ol>
          </section>

          <section className="bg-white border border-gray-200 rounded-lg shadow-sm p-4">
            <div className="flex items-center gap-2">
              <button onClick={classify} disabled={cells.size === 0}
                className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">
                What is this?
              </button>
              <span className="text-[11px] text-gray-500">
                Runs 300 generations and says whether it dies, settles, oscillates or flies.
              </span>
            </div>
            {verdict && <p className="text-[11px] text-gray-800 mt-2">{verdict}</p>}
          </section>
        </div>
      </main>
    </div>
  );
}

/**
 * The volume, as instanced cubes.
 *
 * One InstancedMesh rather than a mesh per cell: a soup can be thousands of
 * cubes and a thousand draw calls a frame is a slideshow. The instance count is
 * the only thing that changes between generations, so a generation costs a
 * matrix write per live cube and nothing else.
 *
 * Orbit is hand-rolled — a spherical camera moved by dragging — because
 * three's OrbitControls lives in an examples subpath that would need its own
 * import path and this is twenty lines.
 */
function LatticeView({ cells, size, colour, slice }: {
  cells: Cells3; size: number; colour: string; slice: number | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{
    render: () => void;
    setCells: (c: Cells3, slice: number | null) => void;
    dispose: () => void;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const w = el.clientWidth, h = Math.round(el.clientWidth * 0.62);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#0b1020");

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 5000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    el.replaceChildren(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(1, 2, 1.5);
    scene.add(key);

    // The lattice's own extent, so the volume being simulated is visible even
    // when nothing is alive in most of it.
    const cage = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)),
      new THREE.LineBasicMaterial({ color: 0x334155 }),
    );
    cage.position.set(size / 2 - 0.5, size / 2 - 0.5, size / 2 - 0.5);
    scene.add(cage);

    const MAX = 60000;
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.9, 0.9, 0.9),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(colour) }),
      MAX,
    );
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    scene.add(mesh);

    // Spherical camera: yaw, pitch, distance.
    let yaw = 0.9, pitch = 0.55, dist = size * 2.2;
    const centre = new THREE.Vector3(size / 2, size / 2, size / 2);
    const place = () => {
      camera.position.set(
        centre.x + dist * Math.cos(pitch) * Math.cos(yaw),
        centre.y + dist * Math.sin(pitch),
        centre.z + dist * Math.cos(pitch) * Math.sin(yaw),
      );
      camera.lookAt(centre);
    };
    place();

    let dragging = false, lastX = 0, lastY = 0;
    const down = (e: PointerEvent) => { dragging = true; lastX = e.clientX; lastY = e.clientY; };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      yaw -= (e.clientX - lastX) * 0.008;
      pitch = Math.max(-1.5, Math.min(1.5, pitch + (e.clientY - lastY) * 0.008));
      lastX = e.clientX; lastY = e.clientY;
      place(); renderer.render(scene, camera);
    };
    const up = () => { dragging = false; };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      dist = Math.max(size * 0.6, Math.min(size * 6, dist * (1 + Math.sign(e.deltaY) * 0.12)));
      place(); renderer.render(scene, camera);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });

    const dummy = new THREE.Object3D();
    const setCells = (c: Cells3, sl: number | null) => {
      let n = 0;
      for (const k of c) {
        if (n >= MAX) break;
        const z = z3(k);
        if (sl !== null && z !== sl) continue;      // one layer only
        dummy.position.set(x3(k), y3(k), z);
        dummy.updateMatrix();
        mesh.setMatrixAt(n++, dummy.matrix);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      renderer.render(scene, camera);
    };

    api.current = { render: () => renderer.render(scene, camera), setCells, dispose: () => {
      renderer.domElement.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("wheel", wheel);
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      cage.geometry.dispose();
      (cage.material as THREE.Material).dispose();
      renderer.dispose();
    } };
    renderer.render(scene, camera);
    return () => { api.current?.dispose(); api.current = null; };
  }, [size, colour]);

  useEffect(() => { api.current?.setCells(cells, slice); }, [cells, slice]);

  return <div ref={host} className="w-full rounded border border-gray-200 overflow-hidden" />;
}
