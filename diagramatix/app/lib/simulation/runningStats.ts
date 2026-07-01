/**
 * Running (live) statistics for the animated replay: as the playback clock
 * advances, the stats table climbs and the bottleneck lights up. We precompute a
 * timeline of snapshots from the event trace once, then read the state at any
 * playback time by binary search (O(log n) per frame — smooth even on a big
 * trace).
 *
 * These are ONE replication's live numbers (what you're watching). The rigorous
 * multi-replication figures with confidence intervals still come from ▶ Run.
 */
import type { TraceEvent } from "./engine";

export interface TeamLive { queued: number; busy: number }
export interface StatSnapshot {
  t: number;
  completed: number;   // tokens finished so far
  inFlight: number;    // spawned − finished
  perTeam: Record<string, TeamLive>; // current queue + in-service per team
}

/** Precompute the snapshot timeline. `nodeTeam` maps a node id → its team id;
 *  nodes with no team don't contribute to the per-team queue/busy counts. */
export function buildStatTimeline(trace: TraceEvent[], nodeTeam: Map<string, string>): StatSnapshot[] {
  let completed = 0, inFlight = 0;
  const queued: Record<string, number> = {};
  const busy: Record<string, number> = {};
  const teams = new Set<string>();
  // Each live token's current team + state, so a move/exit decrements the right
  // counter.
  const tok = new Map<string, { team?: string; state: "queued" | "busy" | "moving" }>();

  const dec = (rec: Record<string, number>, team?: string) => { if (team) rec[team] = Math.max(0, (rec[team] ?? 0) - 1); };
  const clear = (id: string) => {
    const s = tok.get(id);
    if (!s) return;
    if (s.state === "queued") dec(queued, s.team);
    else if (s.state === "busy") dec(busy, s.team);
  };
  const snap = (t: number): StatSnapshot => {
    const perTeam: Record<string, TeamLive> = {};
    for (const tm of teams) perTeam[tm] = { queued: queued[tm] ?? 0, busy: busy[tm] ?? 0 };
    return { t, completed, inFlight, perTeam };
  };

  const out: StatSnapshot[] = [];
  for (const ev of trace) {
    const team = ev.nodeId ? nodeTeam.get(ev.nodeId) : undefined;
    if (team) teams.add(team);
    switch (ev.kind) {
      case "spawn":
        inFlight++;
        break;
      case "enter": // moved to a new node — leaves any queue/service it was in
        clear(ev.tokenId);
        tok.set(ev.tokenId, { team, state: "moving" });
        break;
      case "queue":
        clear(ev.tokenId);
        if (team) queued[team] = (queued[team] ?? 0) + 1;
        tok.set(ev.tokenId, { team, state: "queued" });
        break;
      case "service": { // was queued → now in service
        const s = tok.get(ev.tokenId);
        if (s?.state === "queued") dec(queued, s.team);
        if (team) busy[team] = (busy[team] ?? 0) + 1;
        tok.set(ev.tokenId, { team, state: "busy" });
        break;
      }
      case "exit":
        clear(ev.tokenId);
        tok.delete(ev.tokenId);
        completed++;
        inFlight = Math.max(0, inFlight - 1);
        break;
    }
    out.push(snap(ev.t));
  }
  return out;
}

/** The snapshot in effect at playback time `t` (last snapshot with snapshot.t ≤ t). */
export function statsAt(timeline: StatSnapshot[], t: number): StatSnapshot | null {
  if (!timeline.length || timeline[0].t > t) return null;
  let lo = 0, hi = timeline.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].t <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return timeline[ans];
}
