"use client";

/**
 * Green-phosphor heatmap of the open diagram. Runs a short Monte-Carlo
 * client-side and tints each task by its wait time, with a mono-green wait
 * badge. The hottest task glows brightest = the bottleneck at a glance.
 *
 * Linked (collapsed) subprocesses are SPLICED in before assembly, exactly as
 * ▶ Run and the Replay do. Without that, a linked subprocess is a black-box
 * pass-through: its internal tasks contribute no load, so per-team utilisation
 * is understated and the headline "bottleneck" can name the wrong team. Nodes
 * inside a splice carry namespaced ids ("<subId>~<childId>", recursive) which
 * the current diagram has no box for, so their heat rolls UP onto the
 * subprocess box — worst inner wait wins, because that is what the parent box
 * needs to signal. Double-click a linked subprocess to drill inside, as in the
 * replay.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { spliceLinkedSubprocesses } from "@/app/lib/simulation/spliceLinks";
import { drillPrefix, visibleNodeId } from "@/app/lib/simulation/drillIds";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { DEFAULT_RUN_CONFIG, type WorkCalendar } from "@/app/lib/simulation/types";
import { MatrixButton } from "../matrix/MatrixChrome";

const SIM_TYPES = new Set(["start-event", "end-event", "task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);
interface NodePos { id: string; cx: number; cy: number; x: number; y: number; w: number; h: number; label: string }

interface Heat { util: number; wait: number; teamId?: string }

export function SimulationHeatmap({ data, teamCapacities, teamCalendars, calendarsById, diagramId, diagramsById, onClose }: { data: DiagramData; teamCapacities?: Record<string, number>; teamCalendars?: Record<string, WorkCalendar>; calendarsById?: Record<string, WorkCalendar>; diagramId?: string; diagramsById?: Map<string, DiagramData>; onClose?: () => void }) {
  const [reps, setReps] = useState(12);
  const [nonce, setNonce] = useState(0);
  const [computing, setComputing] = useState(false);
  const [heat, setHeat] = useState<{ byNode: Map<string, Heat>; topNode: string | null; bottleneck: string | null; teams: Record<string, number> }>(
    { byNode: new Map(), topNode: null, bottleneck: null, teams: {} },
  );

  // ── Drill-down: which linked subprocess instance we're looking inside, as in
  // the replay. Each entry adds a "<subId>~" segment to the stat-id prefix and
  // swaps the schematic to that subprocess's child diagram. ──
  const [drillStack, setDrillStack] = useState<{ subId: string; diagramId: string; label: string }[]>([]);
  useEffect(() => { setDrillStack([]); }, [data]);
  const viewData = useMemo(() => {
    if (!drillStack.length) return data;
    return diagramsById?.get(drillStack[drillStack.length - 1].diagramId) ?? data;
  }, [drillStack, data, diagramsById]);
  const prefix = drillPrefix(drillStack.map((d) => d.subId));
  const svgRef = useRef<SVGSVGElement>(null);
  const drilledRef = useRef(false);
  useEffect(() => { drilledRef.current = drillStack.length > 0; }, [drillStack]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !drilledRef.current) return;
      e.stopPropagation(); e.preventDefault();
      setDrillStack((s) => s.slice(0, -1));
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  /** Linked subprocesses in the CURRENT view that we hold child data for — the
   *  boxes that hide detail, and so are drillable. */
  const drillable = useMemo(() => new Set(
    viewData.elements
      .filter((el) => (el.type === "subprocess" || el.type === "subprocess-expanded")
        && typeof el.properties?.linkedDiagramId === "string"
        && !!diagramsById?.has(el.properties.linkedDiagramId as string))
      .map((el) => el.id),
  ), [viewData, diagramsById]);

  function onDoubleClick(e: React.MouseEvent) {
    const svg = svgRef.current; if (!svg) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return;
    const w = pt.matrixTransform(ctm.inverse());
    const hit = viewData.elements
      .filter((el) => drillable.has(el.id) && w.x >= el.x && w.x <= el.x + el.width && w.y >= el.y && w.y <= el.y + el.height)
      .sort((a, b) => a.width * a.height - b.width * b.height)[0];
    if (hit) setDrillStack((s) => [...s, { subId: hit.id, diagramId: hit.properties!.linkedDiagramId as string, label: hit.label || "subprocess" }]);
  }

  // ── Geometry (mirrors the replay schematic) ──
  const nodes = useMemo<NodePos[]>(
    () => viewData.elements.filter((e) => SIM_TYPES.has(e.type)).map((e) => ({
      id: e.id, x: e.x, y: e.y, w: e.width, h: e.height, cx: e.x + e.width / 2, cy: e.y + e.height / 2, label: e.label,
    })),
    [viewData],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const edges = useMemo(() => viewData.connectors.filter((c) => nodeById.has(c.sourceId) && nodeById.has(c.targetId)), [viewData, nodeById]);
  const vb = useMemo(() => {
    if (nodes.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const maxX = Math.max(...nodes.map((n) => n.x + n.w)), maxY = Math.max(...nodes.map((n) => n.y + n.h));
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [nodes]);

  // ── Run the Monte-Carlo + build the heat map ──
  useEffect(() => {
    setComputing(true);
    // Defer so the "computing" state paints before the (synchronous) run.
    const id = window.setTimeout(() => {
      // Splice linked subprocesses in, exactly as ▶ Run does — otherwise their
      // internal work contributes no load and the bottleneck can be wrong.
      const src = diagramsById && diagramId ? spliceLinkedSubprocesses(data, diagramId, diagramsById) : data;
      const net = assembleFromDiagram(src, { teamCapacities, strictTeams: true, teamCalendars, calendarsById });
      const teamOf = new Map(net.nodes.map((n) => [n.id, n.teamId]));
      const { stats } = runMonteCarlo(net, { ...DEFAULT_RUN_CONFIG, horizon: 2000, warmUp: 200, replications: Math.max(1, reps), seed: 1, collectQueues: true });

      const byNode = new Map<string, Heat>();
      for (const [rawId, ns] of Object.entries(stats.perNode)) {
        // Onto the box the CURRENT view can draw — deeper splices roll up.
        const visible = visibleNodeId(rawId, prefix);
        if (visible === null) continue;
        const teamId = teamOf.get(rawId) ?? undefined;
        const util = teamId ? stats.perTeam[teamId]?.utilization.mean ?? 0 : 0;
        const prev = byNode.get(visible);
        // Several spliced nodes can roll onto one box — the WORST inner wait is
        // what that box has to signal, so take the max rather than the last.
        if (!prev || ns.wait.mean > prev.wait) {
          byNode.set(visible, { util: Math.max(util, prev?.util ?? 0), wait: ns.wait.mean, teamId: prev?.teamId ?? teamId });
        } else if (util > prev.util) {
          byNode.set(visible, { ...prev, util });
        }
      }
      let topNode: string | null = null, topWait = -1;
      for (const [id, h] of byNode) if (h.wait > topWait) { topWait = h.wait; topNode = id; }

      // Team stats are whole-network (they already include spliced work), so the
      // bottleneck is reported across everything, not just the visible boxes.
      const bottleneck = Object.entries(stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean)[0]?.[0] ?? null;
      const teams = Object.fromEntries(Object.entries(stats.perTeam).map(([t, s]) => [t, s.utilization.mean]));
      setHeat({ byNode, topNode, bottleneck, teams });
      setComputing(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [data, diagramId, diagramsById, prefix, teamCapacities, teamCalendars, calendarsById, reps, nonce]);

  // Heat → fill by WAIT TIME, relative to the worst wait in the diagram:
  // green = good (little/no wait) · orange = poor · red = bad; the worst nodes
  // glow full red. Wait time is what the user actually feels, so it drives the
  // colour (utilisation still shown as the bottleneck readout).
  const maxWait = useMemo(() => {
    let m = 0; for (const h of heat.byNode.values()) if (h.wait > m) m = h.wait; return m;
  }, [heat]);
  const fillFor = (h: Heat | undefined): { fill: string; opacity: number; glow: boolean } => {
    const wait = h?.wait ?? 0;
    const w = maxWait > 0 ? wait / maxWait : 0;
    // green · amber · red · purple(=the very worst)
    const fill = w < 0.34 ? "#22c55e" : w < 0.6 ? "#f59e0b" : w < 0.85 ? "#ef4444" : "#a855f7";
    return { fill, opacity: 0.16 + 0.64 * w, glow: w >= 0.6 };
  };

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-green-400/80">
        <span className="text-green-300 tracking-widest">▦ HEATMAP</span>
        <label className="flex items-center gap-2">
          reps
          <input type="range" min={1} max={40} value={reps} onChange={(e) => setReps(parseInt(e.target.value, 10))} className="accent-green-500" />
          <span className="w-7 text-right">{reps}</span>
        </label>
        <MatrixButton onClick={() => setNonce((n) => n + 1)}>{computing ? "◴ running…" : "↻ Re-run"}</MatrixButton>
        {heat.bottleneck && <span className="text-green-300">bottleneck: {heat.bottleneck} ({(heat.teams[heat.bottleneck] * 100).toFixed(0)}%)</span>}
        {onClose && <MatrixButton variant="danger" onClick={onClose} className="ml-auto">✕ Close</MatrixButton>}
      </div>

      {/* Drill breadcrumb — where we are, and how to get back. */}
      {drillStack.length > 0 && (
        <div className="flex items-center gap-1 text-[11px] font-mono text-green-400/70 flex-wrap">
          <button onClick={() => setDrillStack([])} className="hover:text-green-300 underline">top</button>
          {drillStack.map((d, i) => (
            <span key={`${d.subId}-${i}`} className="flex items-center gap-1">
              <span className="text-green-500/50">›</span>
              <button
                onClick={() => setDrillStack((s) => s.slice(0, i + 1))}
                className={i === drillStack.length - 1 ? "text-green-300" : "hover:text-green-300 underline"}
              >{d.label}</button>
            </span>
          ))}
          <span className="text-green-400/40 ml-1">(Esc to go back)</span>
        </div>
      )}

      <div className="relative flex-1 border border-green-500/30 rounded overflow-hidden bg-black min-h-[240px]">
        <svg
          ref={svgRef}
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          onDoubleClick={onDoubleClick}
        >
          {edges.map((c) => { const s = nodeById.get(c.sourceId)!, t = nodeById.get(c.targetId)!; return <line key={c.id} x1={s.cx} y1={s.cy} x2={t.cx} y2={t.cy} stroke="#14532d" strokeWidth={1.5} />; })}
          {nodes.map((n) => {
            const h = heat.byNode.get(n.id);
            const f = fillFor(h);
            const isTop = n.id === heat.topNode && (h?.wait ?? 0) > 0.01;
            return (
              <g key={n.id} style={f.glow ? { filter: `drop-shadow(0 0 7px ${f.fill})` } : undefined}>
                <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={4} fill={f.fill} fillOpacity={f.opacity}
                  stroke={isTop ? "#fecaca" : f.fill} strokeWidth={isTop ? 2.5 : 1} strokeOpacity={isTop ? 1 : 0.5} />
                <text x={n.cx} y={n.cy} textAnchor="middle" dominantBaseline="middle" fontSize={10} fill="#e5faec" style={{ pointerEvents: "none" }}>
                  {n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label}
                </text>
                {h && h.wait > 0.05 && (
                  <text x={n.x + n.w - 2} y={n.y + 9} textAnchor="end" fontSize={8} fill="#ffffff" style={{ pointerEvents: "none" }}>
                    ⧗{h.wait.toFixed(1)}
                  </text>
                )}
                {/* This box hides a whole linked process whose heat is rolled up
                    into it — say so, and that a double-click opens it. */}
                {drillable.has(n.id) && (
                  <text x={n.x + 3} y={n.y + n.h - 3} fontSize={8} fill="#86efac" style={{ pointerEvents: "none" }}>
                    ⧉ dbl-click
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        <div className="absolute bottom-3 left-3 font-mono text-[10px] text-green-400/70 bg-black/70 border border-green-500/40 rounded px-2 py-1">
          avg wait: <span className="text-green-400">green</span> good · <span className="text-amber-400">orange</span> poor · <span className="text-red-400">red</span> bad · <span className="text-purple-400">purple</span> worst · ⧗ = avg wait · worst node ringed
        </div>
      </div>
    </div>
  );
}
