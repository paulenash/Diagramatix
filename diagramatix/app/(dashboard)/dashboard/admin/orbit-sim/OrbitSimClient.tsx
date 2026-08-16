"use client";

import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction, type ReactNode } from "react";
import * as THREE from "three";
import {
  initBodies, verletStep, energy, bodyColour,
  type Body, type Vec3, type VelocityMode,
} from "@/app/lib/orbit/nbody";

const MAX_CONFIG = 10; // per-body colour + mass are configurable up to here
const MAX_BODIES = 50;

interface OrbitConfig {
  n: number;
  colours: string[]; // length MAX_CONFIG
  masses: number[];  // length MAX_CONFIG
  massMin: number; massMax: number; // auto-generated bodies (index ≥ MAX_CONFIG)
  cubeSize: number;
  G: number;
  dt: number;
  substeps: number;
  softening: number;
  velocityMode: VelocityMode;
  speedBound: number;
  trail: number;
  autoRotate: boolean;
  seed: number;
}

// Bright, well-separated starting palette for the first 10.
const DEFAULT_COLOURS = [
  "#ff3b30", "#34c7ff", "#ffd60a", "#ff2d95", "#30ff6a",
  "#ff9500", "#bf5af2", "#00e5c8", "#ff6b6b", "#8cff32",
];

const DEFAULTS: OrbitConfig = {
  n: 4,
  colours: [...DEFAULT_COLOURS],
  masses: Array(MAX_CONFIG).fill(1),
  massMin: 0.5, massMax: 4,
  cubeSize: 10,
  G: 1,
  dt: 0.02,
  substeps: 3,
  softening: 0.3,
  velocityMode: "virial",
  speedBound: 1,
  trail: 160,
  autoRotate: true,
  seed: 1,
};

/** Per-body masses from the config: user values for the first ≤10, then random
 *  within [massMin, massMax] (seeded, so the run is reproducible). */
function buildMasses(cfg: OrbitConfig): number[] {
  const rng = mulberry(cfg.seed ^ 0x9e3779b9);
  const out: number[] = [];
  for (let i = 0; i < cfg.n; i++) {
    out.push(i < MAX_CONFIG ? cfg.masses[i] : cfg.massMin + rng() * (cfg.massMax - cfg.massMin));
  }
  return out;
}
function mulberry(seed: number): () => number {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function OrbitSimClient() {
  const [cfg, setCfg] = useState<OrbitConfig>(DEFAULTS);
  const [mode, setMode] = useState<"config" | "run">("config");
  const set = <K extends keyof OrbitConfig>(k: K, v: OrbitConfig[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const back = useCallback(() => setMode("config"), []);

  return mode === "config"
    ? <ConfigTile cfg={cfg} set={set} setCfg={setCfg} onRun={() => setMode("run")} />
    : <SimView cfg={cfg} onBack={back} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Config tile
// ─────────────────────────────────────────────────────────────────────────────

function ConfigTile({ cfg, set, setCfg, onRun }: {
  cfg: OrbitConfig;
  set: <K extends keyof OrbitConfig>(k: K, v: OrbitConfig[K]) => void;
  setCfg: Dispatch<SetStateAction<OrbitConfig>>;
  onRun: () => void;
}) {
  const nConfigurable = Math.min(cfg.n, MAX_CONFIG);
  const setBody = (i: number, key: "colours" | "masses", v: string | number) =>
    setCfg((c) => ({ ...c, [key]: c[key].map((x, j) => (j === i ? v : x)) as never }));

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Orbit Simulator</h1>
          <p className="text-xs text-gray-500">N-body point-mass gravity · Velocity-Verlet · softened Newtonian force. Press <kbd className="px-1 border rounded">Esc</kbd> in the sim to return here.</p>
        </div>
        <button onClick={onRun}
          className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700">
          ▶ Test / Run
        </button>
      </div>

      <Section title="Cluster">
        <Field label={`Bodies (2–${MAX_BODIES})`}>
          <input type="range" min={2} max={MAX_BODIES} value={cfg.n}
            onChange={(e) => set("n", +e.target.value)} className="w-48" />
          <span className="ml-2 tabular-nums text-sm">{cfg.n}</span>
        </Field>
        <p className="text-[11px] text-gray-500">Colour + mass are configurable for the first {MAX_CONFIG}; beyond that, colours spread across the spectrum and masses are random within the bounds below.</p>
      </Section>

      <Section title={`Bodies 1–${nConfigurable}`}>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Array.from({ length: nConfigurable }, (_, i) => (
            <div key={i} className="flex items-center gap-1.5 border border-gray-200 rounded p-1.5">
              <input type="color" value={cfg.colours[i]} onChange={(e) => setBody(i, "colours", e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent" title={`Body ${i + 1} colour`} />
              <label className="text-[10px] text-gray-500">m</label>
              <input type="number" min={0.05} step={0.05} value={cfg.masses[i]}
                onChange={(e) => setBody(i, "masses", Math.max(0.05, +e.target.value))}
                className="w-14 text-xs border border-gray-200 rounded px-1 py-0.5" title={`Body ${i + 1} relative mass`} />
            </div>
          ))}
        </div>
        {cfg.n > MAX_CONFIG && (
          <div className="flex gap-4 mt-1">
            <Field label="Auto mass min"><NumIn v={cfg.massMin} on={(v) => set("massMin", v)} step={0.1} min={0.05} /></Field>
            <Field label="Auto mass max"><NumIn v={cfg.massMax} on={(v) => set("massMax", v)} step={0.1} min={0.1} /></Field>
          </div>
        )}
      </Section>

      <Section title="Physics">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="Gravity G"><NumIn v={cfg.G} on={(v) => set("G", v)} step={0.1} min={0} /></Field>
          <Field label="Cube size"><NumIn v={cfg.cubeSize} on={(v) => set("cubeSize", v)} step={1} min={1} /></Field>
          <Field label="Softening ε"><NumIn v={cfg.softening} on={(v) => set("softening", v)} step={0.05} min={0.01} /></Field>
          <Field label="Time step dt"><NumIn v={cfg.dt} on={(v) => set("dt", v)} step={0.005} min={0.001} /></Field>
          <Field label="Speed (steps/frame)">
            <input type="range" min={1} max={20} value={cfg.substeps} onChange={(e) => set("substeps", +e.target.value)} className="w-28" />
            <span className="ml-1 tabular-nums text-xs">{cfg.substeps}</span>
          </Field>
          <Field label="Initial velocities">
            <select value={cfg.velocityMode} onChange={(e) => set("velocityMode", e.target.value as VelocityMode)}
              className="text-xs border border-gray-200 rounded px-1 py-1">
              <option value="virial">Bound cluster (virial)</option>
              <option value="random">Random within bound</option>
              <option value="cold">Near-zero (collapse)</option>
            </select>
          </Field>
          {cfg.velocityMode === "random" && (
            <Field label="Speed bound"><NumIn v={cfg.speedBound} on={(v) => set("speedBound", v)} step={0.1} min={0} /></Field>
          )}
        </div>
      </Section>

      <Section title="Display">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 items-center">
          <Field label="Trail length">
            <input type="range" min={0} max={400} value={cfg.trail} onChange={(e) => set("trail", +e.target.value)} className="w-28" />
            <span className="ml-1 tabular-nums text-xs">{cfg.trail || "off"}</span>
          </Field>
          <label className="flex items-center gap-1.5 text-xs text-gray-700">
            <input type="checkbox" checked={cfg.autoRotate} onChange={(e) => set("autoRotate", e.target.checked)} /> Auto-rotate camera
          </label>
          <Field label="Seed">
            <div className="flex items-center gap-1">
              <NumIn v={cfg.seed} on={(v) => set("seed", Math.floor(v))} step={1} min={0} />
              <button onClick={() => set("seed", Math.floor(Math.random() * 1e9))}
                className="text-[11px] px-1.5 py-0.5 border border-gray-300 rounded hover:bg-gray-50">🎲</button>
            </div>
          </Field>
        </div>
      </Section>

      <div className="flex justify-end">
        <button onClick={onRun} className="px-5 py-2 text-sm font-medium text-white bg-red-600 rounded hover:bg-red-700">▶ Test / Run</button>
      </div>
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="border border-gray-200 rounded-lg p-4 space-y-2">
    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
    {children}
  </div>
);
const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex flex-col gap-0.5">
    <span className="text-[10px] uppercase tracking-wide text-gray-400">{label}</span>
    <span className="flex items-center">{children}</span>
  </label>
);
const NumIn = ({ v, on, step, min }: { v: number; on: (v: number) => void; step: number; min: number }) => (
  <input type="number" value={v} step={step} min={min}
    onChange={(e) => on(Math.max(min, +e.target.value))}
    className="w-20 text-xs border border-gray-200 rounded px-1.5 py-1" />
);

// ─────────────────────────────────────────────────────────────────────────────
// Simulation view (three.js)
// ─────────────────────────────────────────────────────────────────────────────

function SimView({ cfg, onBack }: { cfg: OrbitConfig; onBack: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const [hud, setHud] = useState({ t: 0, q: 0, n: cfg.n });

  const togglePause = useCallback(() => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── physics ──
    const masses = buildMasses(cfg);
    const bodies: Body[] = initBodies({
      n: cfg.n, cubeSize: cfg.cubeSize, masses, velocityMode: cfg.velocityMode,
      speedBound: cfg.speedBound, G: cfg.G, softening: cfg.softening, seed: cfg.seed,
    });
    let acc: Vec3[] | undefined;
    const meanMass = masses.reduce((a, b) => a + b, 0) / masses.length;
    const baseR = cfg.cubeSize * 0.02; // render radius scale

    // ── scene ──
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x04050a);
    const w = mount.clientWidth, h = mount.clientHeight;
    const camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 1e6);
    const fovR = (camera.fov * Math.PI) / 180;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    mount.appendChild(renderer.domElement);

    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const cores: THREE.Mesh[] = [];
    const glows: THREE.Mesh[] = [];
    const trails: { line: THREE.Line; pts: number[][]; posAttr: THREE.BufferAttribute; colAttr: THREE.BufferAttribute }[] = [];

    bodies.forEach((b, i) => {
      const hex = bodyColour(i, cfg.n, cfg.colours.slice(0, Math.min(cfg.n, MAX_CONFIG)));
      const col = new THREE.Color(hex);
      const r = baseR * Math.cbrt(b.mass / meanMass);
      const core = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: col }));
      core.scale.setScalar(r); scene.add(core); cores.push(core);
      const glow = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
      glow.scale.setScalar(r * 2.6); scene.add(glow); glows.push(glow);

      if (cfg.trail > 0) {
        const geo = new THREE.BufferGeometry();
        const posAttr = new THREE.BufferAttribute(new Float32Array(cfg.trail * 3), 3);
        const colAttr = new THREE.BufferAttribute(new Float32Array(cfg.trail * 3), 3);
        geo.setAttribute("position", posAttr);
        geo.setAttribute("color", colAttr);
        geo.setDrawRange(0, 0);
        const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85 }));
        scene.add(line);
        trails.push({ line, pts: [], posAttr, colAttr });
      }
    });

    // ── camera orbit state ──
    let az = 0.6, el = 0.4, zoom = 1, dist = cfg.cubeSize * 2;
    let dragging = false, px = 0, py = 0;
    const onDown = (e: PointerEvent) => { dragging = true; px = e.clientX; py = e.clientY; };
    const onUp = () => { dragging = false; };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      az -= (e.clientX - px) * 0.006; el = Math.max(-1.5, Math.min(1.5, el + (e.clientY - py) * 0.006));
      px = e.clientX; py = e.clientY;
    };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); zoom = Math.max(0.15, Math.min(6, zoom * Math.exp(e.deltaY * 0.0012))); };
    const dom = renderer.domElement;
    dom.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    dom.addEventListener("wheel", onWheel, { passive: false });

    const onResize = () => {
      const nw = mount.clientWidth, nh = mount.clientHeight;
      camera.aspect = nw / nh; camera.updateProjectionMatrix(); renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", onResize);

    // ── loop ──
    let raf = 0; let steps = 0; let hudTick = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!pausedRef.current) {
        for (let s = 0; s < cfg.substeps; s++) { acc = verletStep(bodies, cfg.dt, cfg.G, cfg.softening, acc); steps++; }
      }

      // update meshes + trails; measure spread (RMS radius, robust to a single escaper)
      let msq = 0;
      bodies.forEach((b, i) => {
        cores[i].position.set(b.pos[0], b.pos[1], b.pos[2]);
        glows[i].position.copy(cores[i].position);
        msq += b.pos[0] ** 2 + b.pos[1] ** 2 + b.pos[2] ** 2;
        const tr = trails[i];
        if (tr && !pausedRef.current) {
          tr.pts.push([b.pos[0], b.pos[1], b.pos[2]]);
          if (tr.pts.length > cfg.trail) tr.pts.shift();
          const base = new THREE.Color(bodyColour(i, cfg.n, cfg.colours.slice(0, Math.min(cfg.n, MAX_CONFIG))));
          for (let k = 0; k < tr.pts.length; k++) {
            tr.posAttr.setXYZ(k, tr.pts[k][0], tr.pts[k][1], tr.pts[k][2]);
            const f = (k + 1) / tr.pts.length; // fade tail → head
            tr.colAttr.setXYZ(k, base.r * f, base.g * f, base.b * f);
          }
          tr.posAttr.needsUpdate = true; tr.colAttr.needsUpdate = true;
          tr.line.geometry.setDrawRange(0, tr.pts.length);
        }
      });
      const rms = Math.sqrt(msq / bodies.length);

      // auto-zoom: frame the cluster (COM stays at origin — momentum is zeroed)
      if (cfg.autoRotate && !dragging) az += 0.0016 * cfg.substeps;
      const fit = Math.max(cfg.cubeSize * 0.6, rms * 2.6) / Math.tan(fovR / 2);
      dist += (fit * zoom - dist) * 0.06;
      camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);

      if (++hudTick % 12 === 0) {
        const { ke, pe } = energy(bodies, cfg.G, cfg.softening);
        setHud({ t: steps * cfg.dt, q: pe < 0 ? ke / -pe : 0, n: bodies.length });
      }
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      dom.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      dom.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      cores.forEach((m) => (m.material as THREE.Material).dispose());
      glows.forEach((m) => (m.material as THREE.Material).dispose());
      trails.forEach((t) => { t.line.geometry.dispose(); (t.line.material as THREE.Material).dispose(); });
      sphere.dispose();
      renderer.dispose();
      if (dom.parentNode === mount) mount.removeChild(dom);
    };
  }, [cfg]);

  // Esc → back to config
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
      if (e.key === " ") { e.preventDefault(); togglePause(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack, togglePause]);

  return (
    <div className="fixed inset-0 z-50 bg-[#04050a]">
      <div ref={mountRef} className="absolute inset-0" />
      <div className="absolute top-3 left-3 flex items-center gap-2 text-xs">
        <button onClick={onBack} className="px-3 py-1.5 bg-white/90 rounded shadow hover:bg-white font-medium">← Config (Esc)</button>
        <button onClick={togglePause} className="px-3 py-1.5 bg-white/90 rounded shadow hover:bg-white font-medium">{paused ? "▶ Play" : "⏸ Pause"} (Space)</button>
      </div>
      <div className="absolute top-3 right-3 text-[11px] text-white/80 bg-black/40 rounded px-2 py-1 tabular-nums space-y-0.5 text-right">
        <div>t = {hud.t.toFixed(1)}</div>
        <div>bodies: {hud.n}</div>
        <div>virial Q = {hud.q.toFixed(2)}</div>
      </div>
      <div className="absolute bottom-3 left-3 text-[10px] text-white/40">drag to rotate · scroll to zoom</div>
    </div>
  );
}
