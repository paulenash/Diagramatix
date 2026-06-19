"use client";

/**
 * Live replay player + Operator console.
 *
 * Animates the recorded trace as glowing green tokens flowing through the
 * process over a slowed simulation clock; tokens visibly stack at busy tasks.
 * The Operator can intervene at the current clock and "fork the timeline":
 * add team capacity or inject work, which deterministically re-runs from the
 * current instant onward (identical prefix, divergent continuation).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import type { SimRunConfig } from "@/app/lib/simulation/types";
import { buildReplay, forkReplay, teamIdsInDiagram, type ReplayData } from "@/app/lib/simulation/replaySource";
import { MatrixButton } from "../matrix/MatrixChrome";

const SIM_TYPES = new Set(["start-event", "end-event", "task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);

interface NodePos { id: string; cx: number; cy: number; x: number; y: number; w: number; h: number; label: string }
interface Frame { t: number; nodeId: string }

export function ReplayView({ data, config, onClose }: { data: DiagramData; config: SimRunConfig; onClose?: () => void }) {
  const [replay, setReplay] = useState<ReplayData>(() => buildReplay(data, config));
  const [simT, setSimT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(20);
  const teamIds = useMemo(() => teamIdsInDiagram(data), [data]);
  const [forkTeam, setForkTeam] = useState(teamIds[0] ?? "");
  const [forkCap, setForkCap] = useState(3);
  const [forked, setForked] = useState(false);
  const raf = useRef(0);
  const last = useRef(0);

  // ── Geometry ──
  const nodes = useMemo<NodePos[]>(
    () => data.elements.filter((e) => SIM_TYPES.has(e.type)).map((e) => ({
      id: e.id, x: e.x, y: e.y, w: e.width, h: e.height, cx: e.x + e.width / 2, cy: e.y + e.height / 2, label: e.label,
    })),
    [data.elements],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edges = useMemo(() => data.connectors.filter((c) => nodeById.has(c.sourceId) && nodeById.has(c.targetId)), [data.connectors, nodeById]);
  const vb = useMemo(() => {
    if (nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [nodes]);

  const keyframes = useMemo(() => {
    const m = new Map<string, { frames: Frame[]; endT: number }>();
    for (const ev of replay.trace) {
      let k = m.get(ev.tokenId);
      if (!k) { k = { frames: [], endT: ev.t }; m.set(ev.tokenId, k); }
      if (ev.kind === "exit") k.endT = ev.t;
      else if (ev.nodeId) k.frames.push({ t: ev.t, nodeId: ev.nodeId });
      k.endT = Math.max(k.endT, ev.t);
    }
    return m;
  }, [replay.trace]);

  useEffect(() => {
    function loop(ts: number) {
      if (last.current === 0) last.current = ts;
      const dt = (ts - last.current) / 1000;
      last.current = ts;
      if (playing) setSimT((t) => {
        const next = t + dt * speed;
        if (next >= replay.durationSim) { setPlaying(false); return replay.durationSim; }
        return next;
      });
      raf.current = requestAnimationFrame(loop);
    }
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, replay.durationSim]);

  function tokenPos(tokenId: string): { x: number; y: number } | null {
    const k = keyframes.get(tokenId);
    if (!k || k.frames.length === 0) return null;
    if (simT < k.frames[0].t || simT > k.endT + 0.001) return null;
    let i = k.frames.length - 1;
    while (i > 0 && k.frames[i].t > simT) i--;
    const a = k.frames[i], b = k.frames[i + 1];
    const pa = nodeById.get(a.nodeId);
    if (!pa) return null;
    const pb = b ? nodeById.get(b.nodeId) : undefined;
    if (!pb || b!.t <= a.t) return { x: pa.cx, y: pa.cy };
    const f = Math.min(1, (simT - a.t) / (b!.t - a.t));
    return { x: pa.cx + (pb.cx - pa.cx) * f, y: pa.cy + (pb.cy - pa.cy) * f };
  }

  const liveTokens: { id: string; x: number; y: number }[] = [];
  for (const id of keyframes.keys()) {
    const p = tokenPos(id);
    if (p) { const j = hash(id); liveTokens.push({ id, x: p.x + ((j % 7) - 3) * 3, y: p.y + (((j >> 3) % 7) - 3) * 3 }); }
  }

  function forkCapacity() {
    if (!forkTeam) return;
    setReplay(forkReplay(data, config, simT, { kind: "capacity", teamId: forkTeam, capacity: forkCap }));
    setForked(true); setPlaying(true);
  }
  function forkInject() {
    const src = data.elements.find((e) => e.type === "start-event");
    if (!src) return;
    setReplay(forkReplay(data, config, simT, { kind: "inject", nodeId: src.id, count: 10 }));
    setForked(true); setPlaying(true);
  }
  function resetRun() { setReplay(buildReplay(data, config)); setSimT(0); setForked(false); setPlaying(true); }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-3 flex-wrap">
        <MatrixButton onClick={() => setPlaying((p) => !p)}>{playing ? "❚❚ Pause" : "▶ Play"}</MatrixButton>
        <MatrixButton onClick={resetRun}>↺ Reset</MatrixButton>
        <label className="flex items-center gap-2 text-[11px] text-green-400/70 font-mono">
          speed
          <input type="range" min={1} max={120} value={speed} onChange={(e) => setSpeed(parseInt(e.target.value, 10))} className="accent-green-500" />
          <span className="w-9 text-right">{speed}×</span>
        </label>
        <input type="range" min={0} max={Math.max(1, replay.durationSim)} value={simT}
          onChange={(e) => { setSimT(parseFloat(e.target.value)); setPlaying(false); }} className="flex-1 min-w-[120px] accent-green-500" />
        {onClose && <MatrixButton variant="danger" onClick={onClose}>✕ Close</MatrixButton>}
      </div>

      {/* Operator console */}
      <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono text-green-400/80 border border-green-500/20 rounded px-2 py-1.5">
        <span className="text-green-300 tracking-widest">OPERATOR ⑂</span>
        <span className="text-green-400/40">fork at t={simT.toFixed(0)}:</span>
        <select value={forkTeam} onChange={(e) => setForkTeam(e.target.value)} className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300" disabled={teamIds.length === 0}>
          {teamIds.length === 0 ? <option>no teams</option> : teamIds.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span>→ capacity</span>
        <input type="number" min={1} value={forkCap} onChange={(e) => setForkCap(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-14 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-300" />
        <MatrixButton onClick={forkCapacity}>Apply</MatrixButton>
        <MatrixButton onClick={forkInject}>Inject surge</MatrixButton>
        {forked && <span className="text-green-300">timeline forked ✓</span>}
      </div>

      <div className="relative flex-1 border border-green-500/30 rounded overflow-hidden bg-black min-h-[240px]">
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
          {edges.map((c) => { const s = nodeById.get(c.sourceId)!, t = nodeById.get(c.targetId)!; return <line key={c.id} x1={s.cx} y1={s.cy} x2={t.cx} y2={t.cy} stroke="#14532d" strokeWidth={1.5} />; })}
          {nodes.map((n) => (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={4} fill="#031a05" stroke="#22c55e" strokeWidth={1} strokeOpacity={0.5} />
              <text x={n.cx} y={n.cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#4ade80" style={{ pointerEvents: "none" }}>
                {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
              </text>
            </g>
          ))}
          {liveTokens.map((tk) => (
            <circle key={tk.id} cx={tk.x} cy={tk.y} r={4} fill="#86efac" stroke="#22FF22" strokeWidth={1} style={{ filter: "drop-shadow(0 0 4px #22FF22)" }} />
          ))}
        </svg>
        <div className="absolute bottom-3 right-3 font-mono text-green-300 text-sm bg-black/70 border border-green-500/40 rounded px-3 py-1.5 tabular-nums">
          t = {simT.toFixed(1)} <span className="text-green-500/60 text-xs">/ {replay.durationSim.toFixed(0)}</span>
          <span className="ml-3 text-green-400/70 text-xs">● {liveTokens.length} in flight</span>
        </div>
      </div>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
