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
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { SimRunConfig, WorkCalendar } from "@/app/lib/simulation/types";
import { buildReplay, forkReplay, teamIdsInDiagram, type ReplayData } from "@/app/lib/simulation/replaySource";
import { closedReason, simClockLabel } from "@/app/lib/simulation/calendar";
import { getSimParams } from "@/app/lib/diagram/simParams";
import { buildStatTimeline } from "@/app/lib/simulation/runningStats";
import { drillPrefix, visibleNodeId } from "@/app/lib/simulation/drillIds";
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


export function ReplayView({ data, colorConfig, config, teamCapacities, teamCalendars, calendarsById, diagramId, diagramsById, onClose }: { data: DiagramData; colorConfig?: SymbolColorConfig; config: SimRunConfig; teamCapacities?: Record<string, number>; teamCalendars?: Record<string, WorkCalendar>; calendarsById?: Record<string, WorkCalendar>; diagramId?: string; diagramsById?: Map<string, DiagramData>; onClose?: () => void }) {
  // Flatten linked (collapsed) subprocesses into the run, exactly as ▶ Run does,
  // so their timing/teams are honest instead of a pass-through. Working calendars
  // make tokens queue outside hours, matching the authoritative run.
  const replayOpts = useMemo(() => ({ rootId: diagramId, byId: diagramsById, teamCalendars, calendarsById }), [diagramId, diagramsById, teamCalendars, calendarsById]);
  const [replay, setReplay] = useState<ReplayData>(() => buildReplay(data, config, teamCapacities, replayOpts));
  const [simT, setSimT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(50); // % of "whole run in ~2 min" (see the loop)
  const [showCounts, setShowCounts] = useState(false); // #tokens that took each connector
  const teamIds = useMemo(() => teamIdsInDiagram(data), [data]);
  const [forkTeam, setForkTeam] = useState(teamIds[0] ?? "");
  const [forkCap, setForkCap] = useState(3);
  const [forked, setForked] = useState(false);
  const [zoomBox, setZoomBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomedRef = useRef(false);
  const clickTimer = useRef<number | null>(null);
  const raf = useRef(0);
  const last = useRef(0);

  // ── Drill-down: which linked subprocess instance we're looking inside. Each
  // entry adds a "<subId>~" segment to the token-id prefix; the view swaps to
  // that subprocess's child diagram. Empty = the top-level diagram. ──
  const [drillStack, setDrillStack] = useState<{ subId: string; diagramId: string; label: string }[]>([]);
  // Why a drill attempt did nothing — shown briefly so the gesture is never a
  // silent no-op (set window.__DIAG_DRILL_TRACE = true for the full breakdown).
  const [drillHint, setDrillHint] = useState<string | null>(null);
  useEffect(() => { setDrillStack([]); setZoomBox(null); }, [data]);
  const viewData = useMemo(() => {
    if (!drillStack.length) return data;
    return diagramsById?.get(drillStack[drillStack.length - 1].diagramId) ?? data;
  }, [drillStack, data, diagramsById]);
  const prefix = drillPrefix(drillStack.map((d) => d.subId));

  // ── Geometry (of the current view) ──
  const nodes = useMemo<NodePos[]>(
    () => viewData.elements.filter((e) => SIM_TYPES.has(e.type)).map((e) => ({
      id: e.id, x: e.x, y: e.y, w: e.width, h: e.height, cx: e.x + e.width / 2, cy: e.y + e.height / 2, label: e.label,
    })),
    [viewData],
  );
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const vb = useMemo(() => {
    const els = viewData.elements;
    if (els.length === 0) return { x: 0, y: 0, w: 100, h: 100 };
    const minX = Math.min(...els.map((e) => e.x)), minY = Math.min(...els.map((e) => e.y));
    const maxX = Math.max(...els.map((e) => e.x + e.width)), maxY = Math.max(...els.map((e) => e.y + e.height));
    const pad = 40;
    return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
  }, [viewData]);

  const keyframes = useMemo(() => {
    const m = new Map<string, { frames: Frame[]; endT: number }>();
    for (const ev of replay.trace) {
      if (ev.kind === "fire") continue; // element-activation flash, not a token move
      let k = m.get(ev.tokenId);
      if (!k) { k = { frames: [], endT: ev.t }; m.set(ev.tokenId, k); }
      if (ev.kind === "exit") k.endT = ev.t;
      else if (ev.nodeId) k.frames.push({ t: ev.t, nodeId: ev.nodeId, edgeId: ev.edgeId });
      k.endT = Math.max(k.endT, ev.t);
    }
    return m;
  }, [replay.trace]);

  // Per-connector traversal times (raw namespaced edge id → sorted enter times),
  // so "token counts" can show how many tokens have taken each path by now.
  const edgeTimes = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const ev of replay.trace) {
      if (ev.kind === "enter" && ev.edgeId) (m.get(ev.edgeId) ?? m.set(ev.edgeId, []).get(ev.edgeId)!).push(ev.t);
    }
    for (const a of m.values()) a.sort((x, y) => x - y);
    return m;
  }, [replay.trace]);

  // Element-activation flashes: a boundary event that fired (red, 3 blinks) or an
  // inline catch that was triggered by a throw (green, 2 blinks). Each is visible
  // for a small slice of the run's sim-time around its instant.
  const flashEvents = useMemo(
    () => replay.trace
      .filter((e) => e.kind === "fire" && e.nodeId)
      .map((e) => ({ t: e.t, nodeId: e.nodeId as string, variant: e.variant ?? "boundary" })),
    [replay.trace],
  );

  // Connector id → its routed waypoints, so tokens can glide along the actual
  // sequence connectors between nodes.
  const connWaypoints = useMemo(() => {
    const m = new Map<string, { x: number; y: number }[]>();
    for (const c of viewData.connectors) if (Array.isArray(c.waypoints) && c.waypoints.length >= 2) m.set(c.id, c.waypoints);
    return m;
  }, [viewData]);

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
  const backdrop = useMemo(() => <ReplayDiagramBackdrop data={viewData} colorConfig={colorConfig} />, [viewData, colorConfig]);

  // Lanes/pools whose team follows a working calendar — candidates for the
  // "off-shift" dim cue. Resolved once per view; the open/closed state is
  // evaluated against the playback clock each render (cheap: a handful of lanes).
  const calendarLanes = useMemo(() => {
    const cals = teamCalendars ?? {};
    if (Object.keys(cals).length === 0) return [] as { el: DiagramData["elements"][number]; teams: string[] }[];
    const byId = new Map(viewData.elements.map((e) => [e.id, e]));
    // Nearest lane/pool ancestor of an element.
    const laneOf = (el: DiagramData["elements"][number]): string | undefined => {
      let cur = el.parentId ? byId.get(el.parentId) : undefined;
      const seen = new Set<string>();
      while (cur && !seen.has(cur.id)) {
        seen.add(cur.id);
        if (cur.type === "lane" || cur.type === "pool") return cur.id;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return undefined;
    };
    const lanes = viewData.elements.filter((e) => e.type === "lane" || e.type === "pool");
    // No visible pool/lane (an invisible / unnamed pool): there is nothing to dim,
    // so shade the WHOLE content area instead, using the calendar of whatever
    // team(s) the tasks run on — a stalled queue still reads as "off-shift"
    // (Paul: shade the invisible pool). Synthesise a single pool-sized region.
    if (lanes.length === 0) {
      const teamSet = new Set<string>();
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, any = false;
      for (const el of viewData.elements) {
        if (el.type === "task" || el.type === "subprocess" || el.type === "subprocess-expanded") {
          const tid = getSimParams(el).teamId;
          if (tid && cals[tid]) teamSet.add(tid);
        }
        if (typeof el.x === "number" && typeof el.width === "number") {
          minX = Math.min(minX, el.x); minY = Math.min(minY, el.y);
          maxX = Math.max(maxX, el.x + el.width); maxY = Math.max(maxY, el.y + el.height); any = true;
        }
      }
      if (!any || teamSet.size === 0) return [];
      const pad = 48;
      const synth = {
        id: "__invisible_pool__", type: "pool", label: "", properties: {},
        x: minX - pad, y: minY - pad, width: (maxX - minX) + pad * 2, height: (maxY - minY) + pad * 2,
      } as unknown as DiagramData["elements"][number];
      return [{ el: synth, teams: [...teamSet] }];
    }
    // Every team a lane is responsible for: its own sim.teamId, its label (teams
    // are named after lanes), AND the teams of the tasks inside it — so a lane
    // dims however its team is wired up.
    const teamsByLane = new Map<string, Set<string>>();
    for (const lane of lanes) {
      const set = new Set<string>();
      const tid = getSimParams(lane).teamId;
      if (tid) set.add(tid);
      if (lane.label) set.add(lane.label);
      teamsByLane.set(lane.id, set);
    }
    for (const el of viewData.elements) {
      if (el.type !== "task" && el.type !== "subprocess" && el.type !== "subprocess-expanded") continue;
      const tid = getSimParams(el).teamId;
      if (!tid) continue;
      const la = laneOf(el);
      if (la && teamsByLane.has(la)) teamsByLane.get(la)!.add(tid);
    }
    return lanes
      .map((el) => ({ el, teams: [...(teamsByLane.get(el.id) ?? [])].filter((t) => cals[t]) }))
      .filter((x) => x.teams.length > 0);
  }, [viewData, teamCalendars]);
  // At the current clock, which lanes are closed + why (Lunch / Off-hours /
  // Weekend) — the first off-shift team in the lane wins the label.
  const dimmedLanes = calendarLanes.flatMap(({ el, teams }) => {
    for (const team of teams) {
      const reason = closedReason(simT, teamCalendars![team], config.clockUnit);
      if (reason) return [{ el, team, reason }];
    }
    return [];
  });

  // Single click = zoom into the point (deferred so a double-click can cancel
  // it); double click = drill into a linked subprocess. Esc steps back: unzoom,
  // else pop one drill level.
  const view = zoomBox ?? vb;
  const drilledRef = useRef(false);
  useEffect(() => { zoomedRef.current = !!zoomBox; }, [zoomBox]);
  useEffect(() => { drilledRef.current = drillStack.length > 0; }, [drillStack]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (zoomedRef.current) { e.stopPropagation(); e.preventDefault(); setZoomBox(null); }
      else if (drilledRef.current) { e.stopPropagation(); e.preventDefault(); setDrillStack((s) => s.slice(0, -1)); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  function clientToWorld(clientX: number, clientY: number): { x: number; y: number } | null {
    const svg = svgRef.current; if (!svg) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  }
  function zoomInAt(clientX: number, clientY: number) {
    const w = clientToWorld(clientX, clientY); if (!w) return;
    setZoomBox((prev) => {
      const cur = prev ?? vb;
      const nw = Math.max(vb.w * 0.06, cur.w * 0.6);
      const nh = Math.max(vb.h * 0.06, cur.h * 0.6);
      return { x: w.x - nw / 2, y: w.y - nh / 2, w: nw, h: nh };
    });
  }
  /**
   * Drill into the sub-process under the cursor. Three separate things must hold
   * — the cursor is over a sub-process, it links to a child diagram, and that
   * child has been loaded — and previously ALL THREE failed the same way: by
   * doing nothing at all, which is indistinguishable from a broken gesture.
   *
   * Now the reason is reported: a short on-screen hint, plus a full breakdown to
   * the console when `window.__DIAG_DRILL_TRACE = true` (the same convention as
   * __DIAG_ROUTE_TRACE for connector problems).
   */
  function drillAt(clientX: number, clientY: number) {
    const w = clientToWorld(clientX, clientY);
    const trace = typeof window !== "undefined" && (window as unknown as { __DIAG_DRILL_TRACE?: boolean }).__DIAG_DRILL_TRACE;
    if (!w) { if (trace) console.log("[drill] no world point — the SVG did not resolve the click"); return; }

    const subs = viewData.elements.filter((el) => el.type === "subprocess" || el.type === "subprocess-expanded");
    const under = subs
      .filter((el) => w.x >= el.x && w.x <= el.x + el.width && w.y >= el.y && w.y <= el.y + el.height)
      .sort((a, b) => a.width * a.height - b.width * b.height);

    if (trace) {
      console.log(`[drill] click at world (${Math.round(w.x)},${Math.round(w.y)}) — ${subs.length} sub-process(es) on view, ${under.length} under the cursor`);
      console.log(`[drill] loaded child diagrams: ${diagramsById ? [...diagramsById.keys()].join(", ") || "(none)" : "(map not supplied)"}`);
      for (const el of subs) {
        const link = el.properties?.linkedDiagramId as string | undefined;
        console.log(`[drill]   ${el.type} "${el.label ?? el.id}" link=${link ?? "(none)"} loaded=${link ? !!diagramsById?.has(link) : "n/a"} box=[${Math.round(el.x)},${Math.round(el.y)} ${Math.round(el.width)}x${Math.round(el.height)}]`);
      }
    }

    if (under.length === 0) { setDrillHint("Nothing to open here — double-click a sub-process that links to another diagram."); return; }
    const linked = under.find((el) => !!el.properties?.linkedDiagramId);
    if (!linked) { setDrillHint(`"${under[0].label ?? "This sub-process"}" has no linked diagram — its body is already on screen.`); return; }
    const childId = linked.properties!.linkedDiagramId as string;
    if (!diagramsById?.has(childId)) {
      setDrillHint(`"${linked.label ?? "Sub-process"}" links to a diagram that isn't loaded here — it must be a BPMN diagram in this project.`);
      return;
    }
    setDrillHint(null);
    setDrillStack((s) => [...s, { subId: linked.id, diagramId: childId, label: linked.label || "subprocess" }]);
  }
  function onSvgClick(e: React.MouseEvent) {
    const { clientX, clientY } = e;
    if (clickTimer.current) window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => { zoomInAt(clientX, clientY); clickTimer.current = null; }, 220);
  }
  function onSvgDoubleClick(e: React.MouseEvent) {
    if (clickTimer.current) { window.clearTimeout(clickTimer.current); clickTimer.current = null; }
    drillAt(e.clientX, e.clientY);
  }

  useEffect(() => {
    function loop(ts: number) {
      if (last.current === 0) last.current = ts;
      const dt = (ts - last.current) / 1000;
      last.current = ts;
      if (playing) setSimT((t) => {
        // `speed` is a % of "finish the whole horizon in ~2 minutes": at 100%
        // maxSpeed = durationSim/120 sim-units per second → the full run plays in
        // ~2 min regardless of horizon scale; lower % = proportionally slower.
        const maxSpeed = Math.max(1, replay.durationSim / 120);
        const next = t + dt * (maxSpeed * speed) / 100;
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
    // Which box in the diagram on screen is this token at? null = it's inside a
    // different branch of the splice tree, so it isn't drawn at this level.
    const aNode = visibleNodeId(a.nodeId, prefix);
    if (aNode === null) return null;
    const loc = (id?: string) => (id && prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id);
    if (!b || b.t <= a.t) return { kind: "dwell", nodeId: aNode, entryEdgeId: loc(a.edgeId), tEnter: a.t };
    const dur = b.t - a.t;
    const transitDur = dur * 0.25; // dwell for the first 75%, hop across in the last 25%
    if (simT < b.t - transitDur) return { kind: "dwell", nodeId: aNode, entryEdgeId: loc(a.edgeId), tEnter: a.t };
    const f = transitDur > 0 ? Math.min(1, Math.max(0, (simT - (b.t - transitDur)) / transitDur)) : 1;
    const bNode = visibleNodeId(b.nodeId, prefix) ?? aNode;
    return { kind: "transit", edgeId: loc(b.edgeId), nodeA: aNode, nodeB: bNode, f };
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

  // Flashes active at the current instant. Blink on/off across the window so a
  // boundary fire pulses red 3× and a catch trigger pulses green 2×.
  const flashWindow = Math.max(replay.durationSim * 0.02, 1e-6);
  const flashOverlays: { key: string; node: NodePos; color: string; opacity: number }[] = [];
  flashEvents.forEach((f, i) => {
    if (simT < f.t || simT >= f.t + flashWindow) return;
    const vid = visibleNodeId(f.nodeId, prefix);
    const node = vid ? nodeById.get(vid) : undefined;
    if (!node) return;
    const e = (simT - f.t) / flashWindow; // 0..1 through the window
    // ONE flash: fully on for the first half of the window, then fade off — and
    // the filter above drops it entirely once `e` passes 1, so it always resets
    // to the normal render (no persisting highlight).
    const on = e < 0.5;
    flashOverlays.push({
      key: `${f.nodeId}-${f.t.toFixed(3)}-${i}`,
      node,
      color: f.variant === "boundary" ? "#ef4444" : "#22c55e",
      opacity: on ? 0.95 : 0,
    });
  });

  // Token counts: how many tokens have traversed each connector by the current
  // clock, at the current drill level (raw edge ids are namespaced; strip the
  // drill prefix to match the on-screen connectors).
  const edgeCount = new Map<string, number>();
  if (showCounts) {
    for (const [rawId, times] of edgeTimes) {
      if (prefix && !rawId.startsWith(prefix)) continue;
      const local = prefix && rawId.startsWith(prefix) ? rawId.slice(prefix.length) : rawId;
      let lo = 0, hi = times.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] <= simT) lo = mid + 1; else hi = mid; }
      if (lo > 0) edgeCount.set(local, (edgeCount.get(local) ?? 0) + lo);
    }
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
        <MatrixButton onClick={() => setShowCounts((v) => !v)}>{showCounts ? "① Counts on" : "① Token counts"}</MatrixButton>
        <label className="flex items-center gap-2 text-[11px] text-green-400/70 font-mono" title="100% plays the whole run in ~2 minutes; lower is proportionally slower">
          speed
          <input type="range" min={1} max={100} value={speed} onChange={(e) => setSpeed(parseInt(e.target.value, 10))} className="accent-green-500" />
          <span className="w-24 text-right">{speed}% · ~{Math.max(1, Math.round(replay.durationSim / (Math.max(1, replay.durationSim / 120) * speed / 100)))}s</span>
        </label>
        <input type="range" min={0} max={Math.max(1, replay.durationSim)} value={simT}
          onChange={(e) => { setSimT(parseFloat(e.target.value)); setPlaying(false); }} className="flex-1 min-w-[120px] accent-green-500" />
        {onClose && <MatrixButton onClick={() => { setPlaying(false); onClose(); }}>✓ Complete &amp; Close</MatrixButton>}
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
        <svg ref={svgRef} viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`} className="w-full h-full cursor-zoom-in" preserveAspectRatio="xMidYMid meet" onClick={onSvgClick} onDoubleClick={onSvgDoubleClick}>
          {/* Transparent hit layer so clicks anywhere (incl. empty space) zoom. */}
          <rect x={vb.x} y={vb.y} width={vb.w} height={vb.h} fill="transparent" />
          {/* The real diagram (read-only) as the backdrop. */}
          {backdrop}
          {/* Off-shift cue: dim a lane while its team's calendar is closed, so a
              stalled queue reads as "the team's on lunch / off for the night /
              weekend" rather than a bug. Drawn over the backdrop, under the tokens. */}
          {dimmedLanes.map(({ el, team, reason }) => (
            <g key={`dim-${el.id}`} style={{ pointerEvents: "none" }}>
              <rect x={el.x} y={el.y} width={el.width} height={el.height} fill="#0b0f14" opacity={0.42} />
              <text x={el.x + el.width / 2} y={el.y + el.height / 2} textAnchor="middle" dominantBaseline="middle"
                fontFamily="monospace" fontSize={Math.max(10, Math.min(16, el.height * 0.12))} fill="#fca5a5" opacity={0.85}>
                ☾ {team} — {reason}
              </text>
            </g>
          ))}
          {showCounts && viewData.connectors.map((c) => {
            const n = edgeCount.get(c.id);
            const wp = n ? connWaypoints.get(c.id) : undefined;
            if (!wp) return null;
            const p = pointAlongPolyline(wp, 0.5);
            // Offset PERPENDICULAR to the connector so the count clears the token
            // queue that stacks along it. Dark green + no outline reads cleanly on
            // the light (working-hours) diagram background.
            const a = pointAlongPolyline(wp, 0.4), b = pointAlongPolyline(wp, 0.6);
            const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
            const off = 26;
            return (
              <text key={`cnt-${c.id}`} x={p.x - (dy / len) * off} y={p.y + (dx / len) * off}
                textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={700} fill="#166534">{n}</text>
            );
          })}
          {flashOverlays.map((fo) => (
            <rect key={fo.key} x={fo.node.x - 4} y={fo.node.y - 4} width={fo.node.w + 8} height={fo.node.h + 8}
              rx={6} fill="none" stroke={fo.color} strokeWidth={3} opacity={fo.opacity}
              style={{ filter: `drop-shadow(0 0 4px ${fo.color})` }} />
          ))}
          {liveTokens.map((tk) => (
            <circle key={tk.id} cx={tk.x} cy={tk.y} r={4} fill="#166534" stroke="#052e16" strokeWidth={1} style={{ filter: "drop-shadow(0 0 2px #052e16)" }} />
          ))}
        </svg>
        <div className="absolute top-3 right-3">
          <LiveStatsTable timeline={statTimeline} simT={simT} teamCapacities={teamCapacities} unit={config.clockUnit} />
        </div>
        <div className="absolute top-3 left-3 font-mono text-[10px] text-green-400/60 bg-black/70 border border-green-500/40 rounded px-2 py-1 flex flex-col gap-1">
          {drillHint && (
            <div className="flex items-center gap-2 text-[11px] text-amber-300/90">
              <span>⌕ {drillHint}</span>
              <button onClick={() => setDrillHint(null)} className="text-green-400/60 hover:text-green-200">dismiss</button>
            </div>
          )}
          {drillStack.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <button onClick={() => setDrillStack([])} className="text-green-400/70 hover:text-green-200">◆ top</button>
              {drillStack.map((d, i) => (
                <span key={i} className="flex items-center gap-1">
                  <span className="text-green-500/50">›</span>
                  <button onClick={() => setDrillStack((s) => s.slice(0, i + 1))} className={i === drillStack.length - 1 ? "text-green-200" : "text-green-400/70 hover:text-green-200"}>{d.label || "sub"}</button>
                </span>
              ))}
              <button onClick={() => setDrillStack((s) => s.slice(0, -1))} className="ml-1 text-green-300 hover:text-green-200">‹ back</button>
            </div>
          )}
          <div>
            {zoomBox && <>🔍 zoomed · <button onClick={(e) => { e.stopPropagation(); setZoomBox(null); }} className="text-green-300 hover:text-green-200">Esc reset</button> · </>}
            <span className="text-green-400/45">click zoom · dbl-click drills into a linked subprocess</span>
          </div>
        </div>
        <div className="absolute bottom-3 right-3 font-mono text-green-300 text-sm bg-black/70 border border-green-500/40 rounded px-3 py-1.5 tabular-nums">
          t = {simT.toFixed(1)} <span className="text-green-500/60 text-xs">/ {replay.durationSim.toFixed(0)}</span>
          <span className="ml-3 text-green-200 text-xs" title="Day + time of the working week (t=0 = Monday 00:00)">🕑 {simClockLabel(simT, config.clockUnit)}</span>
          <span className="ml-3 text-green-400/70 text-xs">● {liveTokens.length} in flight</span>
        </div>
      </div>
    </div>
  );
}
