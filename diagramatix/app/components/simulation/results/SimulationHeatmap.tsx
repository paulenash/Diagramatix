"use client";

/**
 * Green-phosphor heatmap of the open diagram. Runs a short Monte-Carlo of the
 * CURRENT diagram client-side (single-diagram assembly → raw element ids, so
 * they map straight onto the schematic — no portfolio namespacing) and tints
 * each task by its resource-pool utilisation, with a mono-green wait badge.
 * The hottest task glows brightest = the bottleneck at a glance.
 */

import { useEffect, useMemo, useState } from "react";
import type { DiagramData } from "@/app/lib/diagram/types";
import { assembleFromDiagram } from "@/app/lib/simulation/assemble";
import { runMonteCarlo } from "@/app/lib/simulation/runner";
import { DEFAULT_RUN_CONFIG, type WorkCalendar } from "@/app/lib/simulation/types";
import { MatrixButton } from "../matrix/MatrixChrome";

const SIM_TYPES = new Set(["start-event", "end-event", "task", "subprocess", "subprocess-expanded", "gateway", "intermediate-event"]);
interface NodePos { id: string; cx: number; cy: number; x: number; y: number; w: number; h: number; label: string }

interface Heat { util: number; wait: number; teamId?: string }

export function SimulationHeatmap({ data, teamCapacities, teamCalendars, calendarsById, onClose }: { data: DiagramData; teamCapacities?: Record<string, number>; teamCalendars?: Record<string, WorkCalendar>; calendarsById?: Record<string, WorkCalendar>; onClose?: () => void }) {
  const [reps, setReps] = useState(12);
  const [nonce, setNonce] = useState(0);
  const [computing, setComputing] = useState(false);
  const [heat, setHeat] = useState<{ byNode: Map<string, Heat>; topNode: string | null; bottleneck: string | null; teams: Record<string, number> }>(
    { byNode: new Map(), topNode: null, bottleneck: null, teams: {} },
  );

  // ── Geometry (mirrors the replay schematic) ──
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

  // ── Run the Monte-Carlo + build the heat map ──
  useEffect(() => {
    setComputing(true);
    // Defer so the "computing" state paints before the (synchronous) run.
    const id = window.setTimeout(() => {
      const net = assembleFromDiagram(data, { teamCapacities, teamCalendars, calendarsById });
      const teamOf = new Map(net.nodes.map((n) => [n.id, n.teamId]));
      const { stats } = runMonteCarlo(net, { ...DEFAULT_RUN_CONFIG, horizon: 2000, warmUp: 200, replications: Math.max(1, reps), seed: 1, collectQueues: true });

      const byNode = new Map<string, Heat>();
      let topNode: string | null = null, topWait = -1;
      for (const [id, ns] of Object.entries(stats.perNode)) {
        const teamId = teamOf.get(id) ?? undefined;
        const util = teamId ? stats.perTeam[teamId]?.utilization.mean ?? 0 : 0;
        byNode.set(id, { util, wait: ns.wait.mean, teamId });
        if (ns.wait.mean > topWait) { topWait = ns.wait.mean; topNode = id; }
      }
      const bottleneck = Object.entries(stats.perTeam).sort((a, b) => b[1].utilization.mean - a[1].utilization.mean)[0]?.[0] ?? null;
      const teams = Object.fromEntries(Object.entries(stats.perTeam).map(([t, s]) => [t, s.utilization.mean]));
      setHeat({ byNode, topNode, bottleneck, teams });
      setComputing(false);
    }, 0);
    return () => window.clearTimeout(id);
  }, [data, teamCapacities, teamCalendars, calendarsById, reps, nonce]);

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

      <div className="relative flex-1 border border-green-500/30 rounded overflow-hidden bg-black min-h-[240px]">
        <svg viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
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
