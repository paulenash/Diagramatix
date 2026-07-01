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
import { buildStatTimeline } from "@/app/lib/simulation/runningStats";
import { LiveStatsTable } from "./LiveStatsTable";
import { ReplayDiagramBackdrop } from "./ReplayDiagramBackdrop";
import { MatrixButton } from "../matrix/MatrixChrome";

const SIM_TYPES = new Set(["start-event", "end-event", "task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);

interface NodePos { id: string; cx: number; cy: number; x: number; y: number; w: number; h: number; label: string }
interface Frame { t: number; nodeId: string; edgeId?: string }

/** Point at arc-length fraction f (0..1) along a polyline (the routed connector
 *  waypoints), so a token glides along the actual sequence connector. */
function pointAlongPolyline(pts: { x: number; y: number }[], f: number): { x: number; y: number } {
  if (pts.length === 0) return { x: 0, y: 0 };
  if (pts.length === 1) return pts[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); seg.push(d); total += d; }
  if (total === 0) return pts[0];
  let target = Math.max(0, Math.min(1, f)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i]) { const t = seg[i] ? target / seg[i] : 0; return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }; }
    target -= seg[i];
  }
  return pts[pts.length - 1];
}

/** Where to DISPLAY a token: nodes inside a spliced linked/expanded subprocess
 *  have ids "<subId>~<childId>" (recursive) — show the token at the top-level
 *  subprocess box in the parent diagram (drill-down comes in Phase 2). */
function displayNodeId(id: string): string { const i = id.indexOf("~"); return i === -1 ? id : id.slice(0, i); }

export function ReplayView({ data, config, teamCapacities, diagramId, diagramsById, onClose }: { data: DiagramData; config: SimRunConfig; teamCapacities?: Record<string, number>; diagramId?: string; diagramsById?: Map<string, DiagramData>; onClose?: () => void }) {
  // Flatten linked (collapsed) subprocesses into the run, exactly as ▶ Run does,
  // so their timing/teams are honest instead of a pass-through.
  const replayOpts = useMemo(() => ({ rootId: diagramId, byId: diagramsById }), [diagramId, diagramsById]);
  const [replay, setReplay] = useState<ReplayData>(() => buildReplay(data, config, teamCapacities, replayOpts));
  const [simT, setSimT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(20);
  const teamIds = useMemo(() => teamIdsInDiagram(data), [data]);
  const [forkTeam, setForkTeam] = useState(teamIds[0] ?? "");
  const [forkCap, setForkCap] = useState(3);
  const [forked, setForked] = useState(false);
  const [zoomBox, setZoomBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomedRef = useRef(false);
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
  const vb = useMemo(() => {
    const els = data.elements;
    if (els.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
    const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
    const maxX = Math.max(...els.map((e) => e.x + e.width)), maxY = Math.max(...els.map((e) => e.y + e.height));
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [data.elements]);

  const keyframes = useMemo(() => {
    const m = new Map<string, { frames: Frame[]; endT: number }>();
    for (const ev of replay.trace) {
      let k = m.get(ev.tokenId);
      if (!k) { k = { frames: [], endT: ev.t }; m.set(ev.tokenId, k); }
      if (ev.kind === "exit") k.endT = ev.t;
      else if (ev.nodeId) k.frames.push({ t: ev.t, nodeId: ev.nodeId, edgeId: ev.edgeId });
      k.endT = Math.max(k.endT, ev.t);
    }
    return m;
  }, [replay.trace]);

  // Connector id → its routed waypoints, so tokens can glide along the actual
  // sequence connectors between nodes.
  const connWaypoints = useMemo(() => {
    const m = new Map<string, { x: number; y: number }[]>();
    for (const c of data.connectors) if (Array.isArray(c.waypoints) && c.waypoints.length >= 2) m.set(c.id, c.waypoints);
    return m;
  }, [data.connectors]);

  // Running-stats timeline the LiveStatsTable reads at the current playback clock
  // (nodeTeam comes from the assembled — possibly spliced — network).
  const statTimeline = useMemo(() => buildStatTimeline(replay.trace, replay.nodeTeam), [replay.trace, replay.nodeTeam]);
  // Rebuild once the project diagrams load, so linked subprocesses splice in.
  useEffect(() => {
    if (diagramsById && diagramsById.size > 0) { setReplay(buildReplay(data, config, teamCapacities, replayOpts)); setSimT(0); setPlaying(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayOpts]);
  // Stable element so the heavy read-only diagram isn't re-rendered every
  // animation frame — only when `data` changes (never during a run).
  const backdrop = useMemo(() => <ReplayDiagramBackdrop data={data} />, [data]);

  // Click-to-zoom: each click zooms further into the clicked point; Esc resets.
  const view = zoomBox ?? vb;
  useEffect(() => { zoomedRef.current = !!zoomBox; }, [zoomBox]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && zoomedRef.current) { e.stopPropagation(); e.preventDefault(); setZoomBox(null); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  function zoomInAt(e: React.MouseEvent) {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const w = pt.matrixTransform(ctm.inverse());
    setZoomBox((prev) => {
      const cur = prev ?? vb;
      const nw = Math.max(vb.w * 0.06, cur.w * 0.6);
      const nh = Math.max(vb.h * 0.06, cur.h * 0.6);
      return { x: w.x - nw / 2, y: w.y - nh / 2, w: nw, h: nh };
    });
  }

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

  // Each token is either DWELLING at a node (queue + service — it sits stacked at
  // the node's entry boundary) or in TRANSIT along the outgoing connector (the
  // last slice of the gap between two nodes). Phase C = the queue backs up at the
  // door.
  type Phase =
    | { kind: "transit"; edgeId?: string; nodeA: string; nodeB: string; f: number }
    | { kind: "dwell"; nodeId: string; entryEdgeId?: string; tEnter: number };
  function tokenPhase(tokenId: string): Phase | null {
    const k = keyframes.get(tokenId);
    if (!k || k.frames.length === 0) return null;
    if (simT < k.frames[0].t || simT > k.endT + 0.001) return null;
    let i = k.frames.length - 1;
    while (i > 0 && k.frames[i].t > simT) i--;
    const a = k.frames[i], b = k.frames[i + 1];
    if (!b || b.t <= a.t) return { kind: "dwell", nodeId: displayNodeId(a.nodeId), entryEdgeId: a.edgeId, tEnter: a.t };
    const dur = b.t - a.t;
    const transitDur = dur * 0.25; // dwell for the first 75%, hop across in the last 25%
    if (simT < b.t - transitDur) return { kind: "dwell", nodeId: displayNodeId(a.nodeId), entryEdgeId: a.edgeId, tEnter: a.t };
    const f = transitDur > 0 ? Math.min(1, Math.max(0, (simT - (b.t - transitDur)) / transitDur)) : 1;
    return { kind: "transit", edgeId: b.edgeId, nodeA: displayNodeId(a.nodeId), nodeB: displayNodeId(b.nodeId), f };
  }
  function transitPos(ph: Extract<Phase, { kind: "transit" }>): { x: number; y: number } | null {
    const wp = ph.edgeId ? connWaypoints.get(ph.edgeId) : undefined;
    if (wp) return pointAlongPolyline(wp, ph.f);
    const pa = nodeById.get(ph.nodeA), pb = nodeById.get(ph.nodeB);
    if (!pa) return null;
    if (!pb) return { x: pa.cx, y: pa.cy };
    return { x: pa.cx + (pb.cx - pa.cx) * ph.f, y: pa.cy + (pb.cy - pa.cy) * ph.f };
  }
  // Stack a waiting token at the node's entry boundary, backing up along the
  // incoming connector (index k = position in the queue).
  function boundaryStackPos(node: NodePos, entryEdgeId: string | undefined, k: number): { x: number; y: number } {
    const gap = 9;
    const wp = entryEdgeId ? connWaypoints.get(entryEdgeId) : undefined;
    if (wp && wp.length >= 2) {
      const last = wp[wp.length - 1], prev = wp[wp.length - 2];
      const dx = last.x - prev.x, dy = last.y - prev.y, len = Math.hypot(dx, dy) || 1;
      return { x: last.x - (dx / len) * gap * k, y: last.y - (dy / len) * gap * k };
    }
    return { x: node.x - 3 - gap * k, y: node.cy };
  }

  const liveTokens: { id: string; x: number; y: number }[] = [];
  const dwellByNode = new Map<string, { id: string; tEnter: number; entryEdgeId?: string }[]>();
  for (const id of keyframes.keys()) {
    const ph = tokenPhase(id);
    if (!ph) continue;
    if (ph.kind === "transit") { const p = transitPos(ph); if (p) liveTokens.push({ id, x: p.x, y: p.y }); }
    else { const arr = dwellByNode.get(ph.nodeId) ?? []; arr.push({ id, tEnter: ph.tEnter, entryEdgeId: ph.entryEdgeId }); dwellByNode.set(ph.nodeId, arr); }
  }
  for (const [nodeId, arr] of dwellByNode) {
    const node = nodeById.get(nodeId);
    if (!node) continue;
    arr.sort((x, y) => x.tEnter - y.tEnter || (x.id < y.id ? -1 : 1)); // FIFO order
    arr.forEach((tk, k) => { const p = boundaryStackPos(node, tk.entryEdgeId, Math.min(k, 18)); liveTokens.push({ id: tk.id, x: p.x, y: p.y }); });
  }

  function forkCapacity() {
    if (!forkTeam) return;
    setReplay(forkReplay(data, config, simT, { kind: "capacity", teamId: forkTeam, capacity: forkCap }, teamCapacities, replayOpts));
    setForked(true); setPlaying(true);
  }
  function forkInject() {
    const src = data.elements.find((e) => e.type === "start-event");
    if (!src) return;
    setReplay(forkReplay(data, config, simT, { kind: "inject", nodeId: src.id, count: 10 }, teamCapacities, replayOpts));
    setForked(true); setPlaying(true);
  }
  function resetRun() { setReplay(buildReplay(data, config, teamCapacities, replayOpts)); setSimT(0); setForked(false); setPlaying(true); }

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
        <select value={forkTeam} onChange={(e) => setForkTeam(e.target.value)} className="bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" disabled={teamIds.length === 0}>
          {teamIds.length === 0 ? <option>no teams</option> : teamIds.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span>→ capacity</span>
        <input type="number" min={1} value={forkCap} onChange={(e) => setForkCap(Math.max(1, parseInt(e.target.value, 10) || 1))} className="w-14 bg-black border border-green-500/40 rounded px-1 py-0.5 text-green-200 [color-scheme:dark]" />
        <MatrixButton onClick={forkCapacity}>Apply</MatrixButton>
        <MatrixButton onClick={forkInject}>Inject surge</MatrixButton>
        {forked && <span className="text-green-300">timeline forked ✓</span>}
      </div>

      <div className="relative flex-1 border border-green-500/30 rounded overflow-hidden bg-black min-h-[240px]">
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="w-full h-full cursor-zoom-in" preserveAspectRatio="xMidYMid meet" onClick={zoomInAt}>
          {/* Transparent hit layer so clicks anywhere (incl. empty space) zoom. */}
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />
          {/* The real diagram (read-only) as the backdrop. */}
          {backdrop}
          {liveTokens.map((tk) => (
            <circle key={tk.id} cx={tk.x} cy={tk.y} r={4} fill="#166534" stroke="#052e16" strokeWidth={1} style={{ filter: "drop-shadow(0 0 2px #052e16)" }} />
          ))}
        </svg>
        <div className="absolute top-3 right-3">
          <LiveStatsTable timeline={statTimeline} simT={simT} teamCapacities={teamCapacities} unit={config.clockUnit} />
        </div>
        <div className="absolute top-3 left-3 font-mono text-[10px] text-green-400/60 bg-black/70 border border-green-500/40 rounded px-2 py-1 flex items-center gap-2">
          {zoomBox ? (
            <>🔍 zoomed<button onClick={(e) => { e.stopPropagation(); setZoomBox(null); }} className="text-green-300 hover:text-green-200">reset · Esc</button></>
          ) : <span>click to zoom in</span>}
        </div>
        <div className="absolute bottom-3 right-3 font-mono text-green-300 text-sm bg-black/70 border border-green-500/40 rounded px-3 py-1.5 tabular-nums">
          t = {simT.toFixed(1)} <span className="text-green-500/60 text-xs">/ {replay.durationSim.toFixed(0)}</span>
          <span className="ml-3 text-green-400/70 text-xs">● {liveTokens.length} in flight</span>
        </div>
      </div>
    </div>
  );
}
