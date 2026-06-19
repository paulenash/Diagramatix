/**
 * The discrete-event simulation engine — resumable by design.
 *
 * A token-based DES over a SimNetwork: sources generate tokens, tasks SEIZE
 * team capacity (queueing → wait time), gateways route by probability or
 * expression condition, sinks record flow time. Everything the run needs lives
 * in a SERIALISABLE state (calendar + pools + tokens + rng cursor + counters),
 * so `snapshot()`/`resume()` capture a run mid-flight — the basis of the live
 * Operator "fork the timeline" feature and of reproducible Monte-Carlo.
 *
 * Pure isomorphic TS: runs server-side (portfolio Monte-Carlo) and client-side
 * (live replay / Operator) from this one file.
 */

import { EventCalendar } from "./eventCalendar";
import { ResourcePool, type PoolState, type QueuedRequest } from "./resourcePool";
import { makeRng, type Rng } from "./rng";
import { sample } from "./distributions";
import { compileExpr, type CompiledExpr, type Value } from "./expr";
import type { SimNetwork, SimNode, SimEdge } from "./model";
import type { SimRunConfig } from "./types";
import type { RepStats, NodeStat } from "./statistics";

type EventType = "GENERATE" | "SERVICE_END" | "RESUME";
interface Ev { type: EventType; nodeId: string; tokenId?: string }

interface Pending { tokenId: string; nodeId: string; units: number; requestedAt: number }
interface Token { id: string; enteredAt: number; props: Record<string, Value>; callStack: string[] }

interface NodeAcc { count: number; waitSum: number }

/** Fully serialisable run state — the snapshot payload. */
export interface SimState {
  clock: number;
  rngCursor: number;
  nextTokenId: number;
  warmedUp: boolean;
  calendar: { heap: { time: number; seq: number; payload: Ev }[]; seqCounter: number };
  pools: Record<string, PoolState<Pending>>;
  tokens: Record<string, Token>;
  arrivalsByNode: Record<string, number>;
  acc: { arrived: number; completed: number; flowSum: number; flowCount: number; perNode: Record<string, NodeAcc> };
}

export class Engine {
  private clock = 0;
  private calendar = new EventCalendar<Ev>();
  private pools = new Map<string, ResourcePool<Pending>>();
  private tokens = new Map<string, Token>();
  private rng: Rng;
  private nextTokenId = 0;
  private warmedUp: boolean;
  private arrivalsByNode = new Map<string, number>();
  // accumulators
  private arrived = 0;
  private completed = 0;
  private flowSum = 0;
  private flowCount = 0;
  private perNode = new Map<string, NodeAcc>();
  // indices
  private nodeById = new Map<string, SimNode>();
  private outEdges = new Map<string, SimEdge[]>();
  private condCache = new Map<string, CompiledExpr>();
  private assignCache = new Map<string, CompiledExpr>();

  constructor(private network: SimNetwork, private config: SimRunConfig, rng?: Rng) {
    this.rng = rng ?? makeRng(config.seed);
    this.warmedUp = config.warmUp <= 0;
    for (const n of network.nodes) this.nodeById.set(n.id, n);
    for (const e of network.edges) {
      const arr = this.outEdges.get(e.source) ?? [];
      arr.push(e);
      this.outEdges.set(e.source, arr);
      if (e.condition) this.condCache.set(e.id, compileExpr(e.condition.expr));
    }
    for (const n of network.nodes) {
      for (const a of n.assign ?? []) {
        if ("expr" in a.value) this.assignCache.set(`${n.id}:${a.property}`, compileExpr(a.value.expr));
      }
    }
    for (const t of network.teams) this.pools.set(t.id, new ResourcePool<Pending>(t.capacity, 0));
  }

  /** Seed sources with their first arrival. */
  reset(): void {
    for (const n of this.network.nodes) {
      if (n.kind === "source" && n.arrival) {
        this.calendar.schedule(this.clock + sample(n.arrival, this.rng), { type: "GENERATE", nodeId: n.id });
      }
    }
  }

  /** Process all events up to and including time `t`. */
  runUntil(t: number): void {
    let ev = this.calendar.peek();
    while (ev && ev.time <= t) {
      this.calendar.pop();
      this.clock = ev.time;
      this.maybeWarmup();
      this.handle(ev.payload);
      ev = this.calendar.peek();
    }
    if (this.clock < t) this.clock = t;
  }

  /** Convenience: reset + run to the configured horizon. */
  run(): RepStats {
    this.reset();
    this.runUntil(this.config.horizon);
    return this.finalize(this.config.horizon);
  }

  private maybeWarmup(): void {
    if (!this.warmedUp && this.clock >= this.config.warmUp) {
      this.resetStats(this.clock);
      this.warmedUp = true;
    }
  }

  private resetStats(now: number): void {
    this.arrived = 0; this.completed = 0; this.flowSum = 0; this.flowCount = 0;
    this.perNode.clear();
    for (const p of this.pools.values()) p.resetStats(now);
  }

  // ── Event handlers ──────────────────────────────────────────────────────
  private handle(ev: Ev): void {
    if (ev.type === "GENERATE") return this.onGenerate(ev.nodeId);
    const token = ev.tokenId ? this.tokens.get(ev.tokenId) : undefined;
    const node = this.nodeById.get(ev.nodeId);
    if (!token || !node) return;
    if (ev.type === "SERVICE_END") this.onServiceEnd(token, node);
    else this.moveNext(token, node); // RESUME
  }

  private onGenerate(nodeId: string): void {
    const node = this.nodeById.get(nodeId);
    if (!node) return;
    const count = this.arrivalsByNode.get(nodeId) ?? 0;
    if (node.maxArrivals !== undefined && count >= node.maxArrivals) return;
    this.arrivalsByNode.set(nodeId, count + 1);

    const token: Token = { id: `t${this.nextTokenId++}`, enteredAt: this.clock, props: this.initProps(), callStack: [] };
    this.tokens.set(token.id, token);
    if (this.warmedUp) this.arrived++;

    const out = this.outEdges.get(nodeId);
    if (out && out.length > 0) this.enterNode(token, out[0].target);
    else this.completeToken(token);

    // Schedule the next arrival (unless we've hit maxArrivals).
    const next = (this.arrivalsByNode.get(nodeId) ?? 0);
    if ((node.maxArrivals === undefined || next < node.maxArrivals) && node.arrival) {
      this.calendar.schedule(this.clock + sample(node.arrival, this.rng), { type: "GENERATE", nodeId });
    }
  }

  private enterNode(token: Token, nodeId: string): void {
    const node = this.nodeById.get(nodeId);
    if (!node) return this.completeToken(token);
    this.applyAssignments(token, node);
    switch (node.kind) {
      case "sink": return this.completeToken(token);
      case "delay":
        this.calendar.schedule(this.clock + (node.delay ? sample(node.delay, this.rng) : 0), { type: "RESUME", nodeId, tokenId: token.id });
        return;
      case "task": return this.startOrQueue(token, node);
      case "gateway": return this.routeGateway(token, node);
      case "source": return this.moveNext(token, node);
    }
  }

  private startOrQueue(token: Token, node: SimNode): void {
    if (node.teamId) {
      const pool = this.pools.get(node.teamId);
      if (pool) {
        const units = node.units ?? 1;
        const pending: Pending = { tokenId: token.id, nodeId: node.id, units, requestedAt: this.clock };
        const granted = pool.request(this.clock, units, pending);
        if (granted) this.startService(token, node, 0);
        // else: queued — service starts on a future release.
        return;
      }
    }
    this.startService(token, node, 0);
  }

  private startService(token: Token, node: SimNode, wait: number): void {
    if (this.warmedUp) {
      const acc = this.perNode.get(node.id) ?? { count: 0, waitSum: 0 };
      acc.count++; acc.waitSum += wait;
      this.perNode.set(node.id, acc);
    }
    let dur = 0;
    if (node.setupTime) dur += sample(node.setupTime, this.rng);
    if (node.cycleTime) dur += sample(node.cycleTime, this.rng);
    this.calendar.schedule(this.clock + dur, { type: "SERVICE_END", nodeId: node.id, tokenId: token.id });
  }

  private onServiceEnd(token: Token, node: SimNode): void {
    if (node.teamId) {
      const pool = this.pools.get(node.teamId);
      if (pool) {
        const granted = pool.release(this.clock, node.units ?? 1);
        for (const p of granted) {
          const gToken = this.tokens.get(p.tokenId);
          const gNode = this.nodeById.get(p.nodeId);
          if (gToken && gNode) this.startService(gToken, gNode, this.clock - p.requestedAt);
        }
      }
    }
    this.moveNext(token, node);
  }

  private moveNext(token: Token, node: SimNode): void {
    const out = this.outEdges.get(node.id);
    if (!out || out.length === 0) return this.completeToken(token);
    this.enterNode(token, out[0].target);
  }

  private routeGateway(token: Token, node: SimNode): void {
    const out = this.outEdges.get(node.id) ?? [];
    if (out.length === 0) return this.completeToken(token);
    if (node.gateway === "parallel" && out.length > 1) {
      // Parallel split: a clone per branch (join sync is a later phase).
      for (const e of out) {
        const clone: Token = { id: `t${this.nextTokenId++}`, enteredAt: token.enteredAt, props: { ...token.props }, callStack: [...token.callStack] };
        this.tokens.set(clone.id, clone);
        this.enterNode(clone, e.target);
      }
      this.tokens.delete(token.id);
      return;
    }
    // Decision (or pass-through merge): choose exactly one edge.
    const chosen = this.chooseEdge(token, out);
    this.enterNode(token, chosen.target);
  }

  private chooseEdge(token: Token, out: SimEdge[]): SimEdge {
    // 1) first satisfied condition
    for (const e of out) {
      const c = this.condCache.get(e.id);
      if (c && c.evalBool({ props: token.props })) return e;
    }
    // 2) probability roulette (only if any probabilities are set)
    if (out.some((e) => e.probability !== undefined)) {
      const r = this.rng.next();
      let acc = 0;
      for (const e of out) { acc += e.probability ?? 0; if (r < acc) return e; }
    }
    // 3) default / else, then first
    return out.find((e) => e.isDefault) ?? out.find((e) => !this.condCache.has(e.id)) ?? out[0];
  }

  private completeToken(token: Token): void {
    if (this.warmedUp) { this.completed++; this.flowSum += this.clock - token.enteredAt; this.flowCount++; }
    this.tokens.delete(token.id);
  }

  private applyAssignments(token: Token, node: SimNode): void {
    for (const a of node.assign ?? []) {
      if ("expr" in a.value) {
        const c = this.assignCache.get(`${node.id}:${a.property}`);
        if (c) token.props[a.property] = c.eval({ props: token.props });
      } else {
        token.props[a.property] = sample(a.value, this.rng);
      }
    }
  }

  private initProps(): Record<string, Value> {
    const props: Record<string, Value> = {};
    for (const def of this.network.properties ?? []) {
      if (def.init === undefined) props[def.name] = 0;
      else if (typeof def.init === "object" && "kind" in def.init) props[def.name] = sample(def.init, this.rng);
      else props[def.name] = def.init;
    }
    return props;
  }

  /** Compute the replication's statistics as of time `now`. */
  finalize(now: number): RepStats {
    const perNode: Record<string, NodeStat> = {};
    for (const [id, a] of this.perNode) perNode[id] = { count: a.count, avgWait: a.count ? a.waitSum / a.count : 0 };
    const perTeam: RepStats["perTeam"] = {};
    for (const [id, p] of this.pools) perTeam[id] = p.stats(now);
    return {
      arrived: this.arrived,
      completed: this.completed,
      avgFlowTime: this.flowCount ? this.flowSum / this.flowCount : 0,
      perNode, perTeam,
    };
  }

  // ── Snapshot / resume (Operator fork + reproducibility) ──────────────────
  snapshot(): SimState {
    const pools: Record<string, PoolState<Pending>> = {};
    for (const [id, p] of this.pools) pools[id] = p.toJSON();
    const tokens: Record<string, Token> = {};
    for (const [id, t] of this.tokens) tokens[id] = { id: t.id, enteredAt: t.enteredAt, props: { ...t.props }, callStack: [...t.callStack] };
    const perNode: Record<string, NodeAcc> = {};
    for (const [id, a] of this.perNode) perNode[id] = { ...a };
    return {
      clock: this.clock,
      rngCursor: this.rng.snapshot(),
      nextTokenId: this.nextTokenId,
      warmedUp: this.warmedUp,
      calendar: this.calendar.toJSON(),
      pools,
      tokens,
      arrivalsByNode: Object.fromEntries(this.arrivalsByNode),
      acc: { arrived: this.arrived, completed: this.completed, flowSum: this.flowSum, flowCount: this.flowCount, perNode },
    };
  }

  static resume(network: SimNetwork, config: SimRunConfig, snap: SimState): Engine {
    const e = new Engine(network, config);
    e.clock = snap.clock;
    e.rng.restore(snap.rngCursor);
    e.nextTokenId = snap.nextTokenId;
    e.warmedUp = snap.warmedUp;
    e.calendar = EventCalendar.fromJSON<Ev>(snap.calendar);
    e.pools = new Map(Object.entries(snap.pools).map(([id, s]) => [id, ResourcePool.fromJSON<Pending>(s)]));
    e.tokens = new Map(Object.entries(snap.tokens).map(([id, t]) => [id, { ...t, props: { ...t.props }, callStack: [...t.callStack] }]));
    e.arrivalsByNode = new Map(Object.entries(snap.arrivalsByNode));
    e.arrived = snap.acc.arrived; e.completed = snap.acc.completed;
    e.flowSum = snap.acc.flowSum; e.flowCount = snap.acc.flowCount;
    e.perNode = new Map(Object.entries(snap.acc.perNode).map(([id, a]) => [id, { ...a }]));
    return e;
  }

  get now(): number { return this.clock; }
}

// Re-export so callers can type pool queue payloads if needed.
export type { QueuedRequest };
