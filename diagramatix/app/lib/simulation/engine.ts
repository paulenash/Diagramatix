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
import type { SimNetwork, SimNode, SimEdge, EventSub } from "./model";
import { SECONDS_PER_UNIT, type SimRunConfig, type PlannedIntervention } from "./types";
import type { RepStats, NodeStat } from "./statistics";

type EventType = "GENERATE" | "SERVICE_END" | "RESUME" | "EVENT_TRIGGER" | "INTERVENTION";
/** Runtime form of a planned intervention carried on an INTERVENTION event.
 *  A revert event (scheduled after a `duration`) is the same shape with the
 *  captured prior value and no duration. */
interface IvPayload { kind: PlannedIntervention["kind"]; target: string; value: number; duration?: number }
interface Ev { type: EventType; nodeId: string; tokenId?: string; scopeInst?: string; esubId?: string; iv?: IvPayload }

interface Pending { tokenId: string; nodeId: string; units: number; requestedAt: number }
/** A subprocess scope instance a token is currently inside. `remaining` =
 *  further body re-runs queued (standard loop / sequential MI); `loopBack` =
 *  per-pass repeat probability (0..100); `parallel` marks a parallel-MI body
 *  instance whose completion is counted by the join. */
interface Frame { sub: string; scopeInst: string; remaining: number; loopBack?: number; parallel?: boolean; handler?: boolean; continueFrom?: string }
interface Token { id: string; enteredAt: number; props: Record<string, Value>; callStack: Frame[]; internal?: boolean }

function cloneStack(s: Frame[]): Frame[] { return s.map((f) => ({ ...f })); }

/** A token-movement event for the live replay player (green-token animation). */
export type TraceEventKind = "spawn" | "enter" | "queue" | "service" | "exit";
export interface TraceEvent { t: number; tokenId: string; kind: TraceEventKind; nodeId?: string; edgeId?: string }

/** A live Operator intervention applied mid-run (the "reach in" levers). */
export type Intervention =
  | { kind: "capacity"; teamId: string; capacity: number }
  | { kind: "inject"; nodeId: string; count: number };

interface NodeAcc { count: number; waitSum: number }

/** Fully serialisable run state — the snapshot payload. */
export interface SimState {
  clock: number;
  rngCursor: number;
  nextTokenId: number;
  nextScopeId: number;
  warmedUp: boolean;
  calendar: { heap: { time: number; seq: number; payload: Ev }[]; seqCounter: number };
  pools: Record<string, PoolState<Pending>>;
  tokens: Record<string, Token>;
  joinCount: Record<string, number>;
  activeScopes: string[];
  cancelledTokens: string[];
  inService: Record<string, { teamId: string; units: number }>;
  arrivalsByNode: Record<string, number>;
  // Applied-intervention state (so an Operator fork preserves timed changes).
  arrivalMult?: Record<string, number>;
  edgeProb?: Record<string, number>;
  acc: { arrived: number; completed: number; flowSum: number; flowCount: number; flowSamples?: number[]; perNode: Record<string, NodeAcc> };
}

export class Engine {
  private clock = 0;
  private calendar = new EventCalendar<Ev>();
  private pools = new Map<string, ResourcePool<Pending>>();
  private tokens = new Map<string, Token>();
  private rng: Rng;
  private nextTokenId = 0;
  private nextScopeId = 0;
  private joinCount = new Map<string, number>(); // parallel-MI scope instance → outstanding instances
  private activeScopes = new Set<string>();      // scope instances currently running (for event-sub triggers)
  private cancelledTokens = new Set<string>();   // tokens whose pending events must be ignored (interrupt)
  private inService = new Map<string, { teamId: string; units: number }>(); // resources a token currently holds
  private esubById = new Map<string, EventSub>();
  private warmedUp: boolean;
  private arrivalsByNode = new Map<string, number>();
  // Planned-intervention runtime state (engine-local so the shared network is
  // never mutated across replications): per-source arrival-rate multiplier and
  // per-edge branch-probability override consulted during routing.
  private arrivalMult = new Map<string, number>();
  private edgeProb = new Map<string, number>();
  private planned: PlannedIntervention[] = [];
  // teamId → cost per hour; drives per-team cost in finalize (0 if unpriced).
  private teamCosts: Record<string, number> = {};
  // accumulators
  private arrived = 0;
  private completed = 0;
  private flowSum = 0;
  private flowCount = 0;
  /** Per-case flow times (individual completed tokens) — retained so the report
   *  can show the true case-level distribution + percentiles, not just the mean.
   *  Transient (pooled into a compact CaseDist at aggregate time); never persisted
   *  on the run except via a snapshot for Operator fork/resume. */
  private flowSamples: number[] = [];
  private perNode = new Map<string, NodeAcc>();
  // indices
  private nodeById = new Map<string, SimNode>();
  private outEdges = new Map<string, SimEdge[]>();
  private condCache = new Map<string, CompiledExpr>();
  private assignCache = new Map<string, CompiledExpr>();
  // trace (for live replay) — opt-in, off for Monte-Carlo
  private traceLog: TraceEvent[] = [];
  private tracing = false;
  private maxTrace = 200000;

  constructor(private network: SimNetwork, private config: SimRunConfig, rng?: Rng, opts?: { trace?: boolean; maxTrace?: number; planned?: PlannedIntervention[]; teamCosts?: Record<string, number> }) {
    this.rng = rng ?? makeRng(config.seed);
    this.tracing = opts?.trace ?? false;
    if (opts?.maxTrace) this.maxTrace = opts.maxTrace;
    if (opts?.planned) this.planned = opts.planned;
    if (opts?.teamCosts) this.teamCosts = opts.teamCosts;
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
      for (const es of n.eventSubs ?? []) this.esubById.set(es.id, es);
    }
    for (const t of network.teams) this.pools.set(t.id, new ResourcePool<Pending>(t.capacity, 0));
  }

  /** Seed sources with their first arrival, and schedule any planned
   *  (timed) interventions onto the calendar. */
  reset(): void {
    this.arrivalMult.clear();
    this.edgeProb.clear();
    for (const n of this.network.nodes) {
      if (n.kind === "source" && n.arrival) {
        this.calendar.schedule(this.clock + sample(n.arrival, this.rng), { type: "GENERATE", nodeId: n.id });
      }
    }
    for (const iv of this.planned) {
      if (!Number.isFinite(iv.t) || iv.t < 0) continue;
      this.calendar.schedule(iv.t, { type: "INTERVENTION", nodeId: iv.target, iv: { kind: iv.kind, target: iv.target, value: iv.value, duration: iv.duration } });
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
    this.flowSamples = [];
    this.perNode.clear();
    for (const p of this.pools.values()) p.resetStats(now);
  }

  // ── Event handlers ──────────────────────────────────────────────────────
  private handle(ev: Ev): void {
    if (ev.type === "GENERATE") return this.onGenerate(ev.nodeId);
    if (ev.type === "INTERVENTION") return this.applyPlanned(ev.iv!);
    if (ev.type === "EVENT_TRIGGER") return this.onEventTrigger(ev.scopeInst!, ev.esubId!);
    if (ev.tokenId && this.cancelledTokens.has(ev.tokenId)) return; // token was interrupted
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
    this.emit("spawn", token.id, nodeId);

    const out = this.outEdges.get(nodeId);
    if (out && out.length > 0) this.enterNode(token, out[0].target, out[0].id);
    else this.completeToken(token);

    // Schedule the next arrival (unless we've hit maxArrivals). A planned
    // "arrival" intervention scales the rate: multiplier m → interval ÷ m.
    const next = (this.arrivalsByNode.get(nodeId) ?? 0);
    if ((node.maxArrivals === undefined || next < node.maxArrivals) && node.arrival) {
      const mult = this.arrivalMult.get(nodeId) ?? 1;
      const delay = sample(node.arrival, this.rng) / (mult > 0 ? mult : 1);
      this.calendar.schedule(this.clock + delay, { type: "GENERATE", nodeId });
    }
  }

  private enterNode(token: Token, nodeId: string, viaEdgeId?: string): void {
    const node = this.nodeById.get(nodeId);
    if (!node) return this.completeToken(token);
    this.emit("enter", token.id, nodeId, viaEdgeId);
    this.applyAssignments(token, node);
    switch (node.kind) {
      case "sink": return this.onReachEnd(token, node);
      case "delay":
        this.calendar.schedule(this.clock + (node.delay ? sample(node.delay, this.rng) : 0), { type: "RESUME", nodeId, tokenId: token.id });
        return;
      case "task": return this.startOrQueue(token, node);
      case "gateway": return this.routeGateway(token, node);
      case "subprocess": return this.enterSubprocess(token, node);
      case "source": return this.moveNext(token, node);
    }
  }

  // ── Subprocess scopes: recurse into the inline body, with loop / MI ──────
  private enterSubprocess(token: Token, node: SimNode): void {
    if (!node.bodyStart) return this.moveNext(token, node); // empty body → pass through
    const loop = node.loop;

    if (loop?.kind === "multi" && loop.ordering === "parallel") {
      // Spawn N concurrent body instances; the last to finish is the continuation.
      const n = Math.max(1, Math.round(sample(loop.instances, this.rng)));
      const scopeInst = `s${this.nextScopeId++}`;
      this.joinCount.set(scopeInst, n);
      for (let i = 0; i < n; i++) {
        const clone: Token = {
          id: `t${this.nextTokenId++}`, enteredAt: token.enteredAt, props: { ...token.props },
          callStack: [...cloneStack(token.callStack), { sub: node.id, scopeInst, remaining: 0, parallel: true }],
          internal: true,
        };
        this.tokens.set(clone.id, clone);
        this.emit("spawn", clone.id, node.id);
        this.enterNode(clone, node.bodyStart, undefined);
      }
      this.tokens.delete(token.id);
      return;
    }

    // Standard loop or sequential MI: one token runs the body, possibly repeated.
    let remaining = 0;
    let loopBack: number | undefined;
    if (loop?.kind === "standard") {
      if (loop.iterations) remaining = Math.max(1, Math.round(sample(loop.iterations, this.rng))) - 1;
      else loopBack = loop.loopBackProb ?? 0;
    } else if (loop?.kind === "multi") {
      remaining = Math.max(1, Math.round(sample(loop.instances, this.rng))) - 1;
    }
    const scopeInst = `s${this.nextScopeId++}`;
    token.callStack.push({ sub: node.id, scopeInst, remaining, loopBack });
    this.armEventSubs(node, scopeInst);
    this.enterNode(token, node.bodyStart, undefined);
  }

  /** Schedule each event subprocess's timer trigger for this scope instance. */
  private armEventSubs(sub: SimNode, scopeInst: string): void {
    if (!sub.eventSubs || sub.eventSubs.length === 0) return;
    this.activeScopes.add(scopeInst);
    for (const es of sub.eventSubs) {
      this.calendar.schedule(this.clock + sample(es.trigger, this.rng), { type: "EVENT_TRIGGER", nodeId: sub.id, scopeInst, esubId: es.id });
    }
  }

  private onEventTrigger(scopeInst: string, esubId: string): void {
    if (!this.activeScopes.has(scopeInst)) return; // parent scope already left — event missed
    const es = this.esubById.get(esubId);
    if (!es) return;

    if (!es.interrupting) {
      // Non-interrupting: a handler runs ALONGSIDE the parent (a new token).
      const handler: Token = {
        id: `t${this.nextTokenId++}`, enteredAt: this.clock, props: {},
        callStack: [{ sub: es.id, scopeInst: `s${this.nextScopeId++}`, remaining: 0, handler: true }],
        internal: true,
      };
      this.tokens.set(handler.id, handler);
      this.emit("spawn", handler.id, es.bodyStart);
      this.enterNode(handler, es.bodyStart, undefined);
      return;
    }

    // Interrupting: cancel the parent scope's in-flight work, then divert to the
    // handler, which becomes the continuation after the subprocess.
    this.activeScopes.delete(scopeInst);
    let lower: Frame[] = [];
    let parentSub: string | undefined;
    let captured = false;
    for (const t of [...this.tokens.values()]) {
      const idx = t.callStack.findIndex((f) => f.scopeInst === scopeInst);
      if (idx < 0) continue;
      if (!captured) { lower = cloneStack(t.callStack.slice(0, idx)); parentSub = t.callStack[idx].sub; captured = true; }
      this.cancelToken(t.id);
    }
    const handler: Token = {
      id: `t${this.nextTokenId++}`, enteredAt: this.clock, props: {},
      // continueFrom = the PARENT subprocess, so when the handler body ends the
      // token resumes the outer flow after the (interrupted) subprocess.
      callStack: [...lower, { sub: es.id, scopeInst: `s${this.nextScopeId++}`, remaining: 0, handler: true, continueFrom: parentSub }],
      internal: lower.some((f) => f.parallel),
    };
    this.tokens.set(handler.id, handler);
    this.emit("spawn", handler.id, es.bodyStart);
    this.enterNode(handler, es.bodyStart, undefined);
  }

  /** Cancel a token: release/dequeue any resource it holds and ignore its
   *  future scheduled event. */
  private cancelToken(tokenId: string): void {
    const held = this.inService.get(tokenId);
    if (held) {
      const pool = this.pools.get(held.teamId);
      if (pool) for (const p of pool.release(this.clock, held.units)) {
        const gt = this.tokens.get(p.tokenId), gn = this.nodeById.get(p.nodeId);
        if (gt && gn) this.startService(gt, gn, this.clock - p.requestedAt);
      }
      this.inService.delete(tokenId);
    } else {
      // may be queued somewhere — drop its pending request from every pool
      for (const pool of this.pools.values()) pool.cancelWhere(this.clock, (p) => p.tokenId === tokenId);
    }
    this.cancelledTokens.add(tokenId);
    this.emit("exit", tokenId);
    this.tokens.delete(tokenId);
  }

  /** A sink: either the end of the current subprocess scope (return to parent,
   *  loop, or join) or a genuine top-level completion. */
  private onReachEnd(token: Token, node: SimNode): void {
    const top = token.callStack[token.callStack.length - 1];
    if (top && node.scope === top.sub) {
      if (top.handler) {
        token.callStack.pop();
        if (top.continueFrom) {
          // interrupting handler finished → resume the outer flow after the
          // (interrupted) parent subprocess; it's now a real continuation token.
          token.internal = token.callStack.some((f) => f.parallel);
          return this.continueFromSub(token, top.continueFrom);
        }
        return this.completeInternal(token); // non-interrupting handler done
      }
      if (top.parallel) {
        const left = (this.joinCount.get(top.scopeInst) ?? 1) - 1;
        if (left > 0) { this.joinCount.set(top.scopeInst, left); this.completeInternal(token); return; }
        // Last instance to finish becomes the real continuation token — it
        // inherits the parent flow (shed the internal-instance flag) so its
        // eventual completion counts, then carries on from the subprocess.
        this.joinCount.delete(top.scopeInst);
        token.callStack.pop();
        token.internal = token.callStack.some((f) => f.parallel); // still internal only if nested in another parallel scope
        return this.continueFromSub(token, top.sub);
      }
      if (top.remaining > 0) { top.remaining--; return this.reenterBody(token, top.sub); }
      if (top.loopBack !== undefined && this.rng.next() * 100 < top.loopBack) return this.reenterBody(token, top.sub);
      token.callStack.pop();
      this.activeScopes.delete(top.scopeInst);
      return this.continueFromSub(token, top.sub);
    }
    this.completeToken(token);
  }

  private reenterBody(token: Token, subId: string): void {
    const s = this.nodeById.get(subId);
    if (s?.bodyStart) this.enterNode(token, s.bodyStart, undefined);
    else this.continueFromSub(token, subId);
  }

  private continueFromSub(token: Token, subId: string): void {
    const s = this.nodeById.get(subId);
    if (s) this.moveNext(token, s);
    else this.completeToken(token);
  }

  private completeInternal(token: Token): void {
    this.emit("exit", token.id);
    this.tokens.delete(token.id); // internal MI instance — no top-level stats
  }

  private startOrQueue(token: Token, node: SimNode): void {
    if (node.teamId) {
      const pool = this.pools.get(node.teamId);
      if (pool) {
        const units = node.units ?? 1;
        const pending: Pending = { tokenId: token.id, nodeId: node.id, units, requestedAt: this.clock };
        const granted = pool.request(this.clock, units, pending);
        if (granted) this.startService(token, node, 0);
        else this.emit("queue", token.id, node.id); // queued — service starts on a future release
        return;
      }
    }
    this.startService(token, node, 0);
  }

  private startService(token: Token, node: SimNode, wait: number): void {
    this.emit("service", token.id, node.id);
    if (node.teamId) this.inService.set(token.id, { teamId: node.teamId, units: node.units ?? 1 });
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
    this.inService.delete(token.id);
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
    this.enterNode(token, out[0].target, out[0].id);
  }

  private routeGateway(token: Token, node: SimNode): void {
    const out = this.outEdges.get(node.id) ?? [];
    if (out.length === 0) return this.completeToken(token);
    if (node.gateway === "parallel" && out.length > 1) {
      // Parallel split: a clone per branch (join sync is a later phase).
      for (const e of out) {
        const clone: Token = { id: `t${this.nextTokenId++}`, enteredAt: token.enteredAt, props: { ...token.props }, callStack: cloneStack(token.callStack), internal: token.internal };
        this.tokens.set(clone.id, clone);
        this.enterNode(clone, e.target, e.id);
      }
      this.tokens.delete(token.id);
      return;
    }
    // Decision (or pass-through merge): choose exactly one edge.
    const chosen = this.chooseEdge(token, out);
    this.enterNode(token, chosen.target, chosen.id);
  }

  /** Edge branch probability with any planned "branchProb" override applied
   *  (engine-local, so the shared network edge is never mutated). */
  private probOf(e: SimEdge): number | undefined {
    return this.edgeProb.has(e.id) ? this.edgeProb.get(e.id) : e.probability;
  }

  private chooseEdge(token: Token, out: SimEdge[]): SimEdge {
    // 1) first satisfied condition
    for (const e of out) {
      const c = this.condCache.get(e.id);
      if (c && c.evalBool({ props: token.props })) return e;
    }
    // 2) probability roulette (only if any probabilities are set)
    if (out.some((e) => this.probOf(e) !== undefined)) {
      const r = this.rng.next();
      let acc = 0;
      for (const e of out) { acc += this.probOf(e) ?? 0; if (r < acc) return e; }
    }
    // 3) default / else, then first
    return out.find((e) => e.isDefault) ?? out.find((e) => !this.condCache.has(e.id)) ?? out[0];
  }

  private completeToken(token: Token): void {
    this.emit("exit", token.id);
    if (this.warmedUp && !token.internal) { const flow = this.clock - token.enteredAt; this.completed++; this.flowSum += flow; this.flowCount++; this.flowSamples.push(flow); }
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
    // busyTime is in clock units; cost = busy-hours × costPerHour.
    const hoursPerUnit = SECONDS_PER_UNIT[this.config.clockUnit] / 3600;
    for (const [id, p] of this.pools) {
      const s = p.stats(now);
      const cost = s.busyTime * hoursPerUnit * (this.teamCosts[id] ?? 0);
      perTeam[id] = { utilization: s.utilization, avgQueue: s.avgQueue, maxQueue: s.maxQueue, cost };
    }
    return {
      arrived: this.arrived,
      completed: this.completed,
      avgFlowTime: this.flowCount ? this.flowSum / this.flowCount : 0,
      flowSamples: this.flowSamples,
      perNode, perTeam,
    };
  }

  // ── Snapshot / resume (Operator fork + reproducibility) ──────────────────
  snapshot(): SimState {
    const pools: Record<string, PoolState<Pending>> = {};
    for (const [id, p] of this.pools) pools[id] = p.toJSON();
    const tokens: Record<string, Token> = {};
    for (const [id, t] of this.tokens) tokens[id] = { id: t.id, enteredAt: t.enteredAt, props: { ...t.props }, callStack: cloneStack(t.callStack), internal: t.internal };
    const perNode: Record<string, NodeAcc> = {};
    for (const [id, a] of this.perNode) perNode[id] = { ...a };
    return {
      clock: this.clock,
      rngCursor: this.rng.snapshot(),
      nextTokenId: this.nextTokenId,
      nextScopeId: this.nextScopeId,
      warmedUp: this.warmedUp,
      calendar: this.calendar.toJSON(),
      pools,
      tokens,
      joinCount: Object.fromEntries(this.joinCount),
      activeScopes: [...this.activeScopes],
      cancelledTokens: [...this.cancelledTokens],
      inService: Object.fromEntries(this.inService),
      arrivalsByNode: Object.fromEntries(this.arrivalsByNode),
      arrivalMult: Object.fromEntries(this.arrivalMult),
      edgeProb: Object.fromEntries(this.edgeProb),
      acc: { arrived: this.arrived, completed: this.completed, flowSum: this.flowSum, flowCount: this.flowCount, flowSamples: [...this.flowSamples], perNode },
    };
  }

  static resume(network: SimNetwork, config: SimRunConfig, snap: SimState): Engine {
    const e = new Engine(network, config);
    e.clock = snap.clock;
    e.rng.restore(snap.rngCursor);
    e.nextTokenId = snap.nextTokenId;
    e.nextScopeId = snap.nextScopeId ?? 0;
    e.warmedUp = snap.warmedUp;
    e.calendar = EventCalendar.fromJSON<Ev>(snap.calendar);
    e.pools = new Map(Object.entries(snap.pools).map(([id, s]) => [id, ResourcePool.fromJSON<Pending>(s)]));
    e.tokens = new Map(Object.entries(snap.tokens).map(([id, t]) => [id, { ...t, props: { ...t.props }, callStack: cloneStack(t.callStack), internal: t.internal }]));
    e.joinCount = new Map(Object.entries(snap.joinCount ?? {}));
    e.activeScopes = new Set(snap.activeScopes ?? []);
    e.cancelledTokens = new Set(snap.cancelledTokens ?? []);
    e.inService = new Map(Object.entries(snap.inService ?? {}));
    e.arrivalsByNode = new Map(Object.entries(snap.arrivalsByNode));
    e.arrivalMult = new Map(Object.entries(snap.arrivalMult ?? {}));
    e.edgeProb = new Map(Object.entries(snap.edgeProb ?? {}));
    e.arrived = snap.acc.arrived; e.completed = snap.acc.completed;
    e.flowSum = snap.acc.flowSum; e.flowCount = snap.acc.flowCount; e.flowSamples = [...(snap.acc.flowSamples ?? [])];
    e.perNode = new Map(Object.entries(snap.acc.perNode).map(([id, a]) => [id, { ...a }]));
    return e;
  }

  // ── Trace (live replay) + Operator interventions ────────────────────────
  private emit(kind: TraceEventKind, tokenId: string, nodeId?: string, edgeId?: string): void {
    if (this.tracing && this.traceLog.length < this.maxTrace) {
      this.traceLog.push({ t: this.clock, tokenId, kind, nodeId, edgeId });
    }
  }

  /** The recorded token-movement events (empty unless constructed with trace). */
  getTrace(): TraceEvent[] { return this.traceLog; }
  clearTrace(): void { this.traceLog = []; }

  /** Apply a planned (timed) intervention fired off the calendar. `capacity`
   *  and `outage` set a pool's capacity (and, with a duration, schedule a
   *  revert to the captured prior value); `arrival` scales a source's rate;
   *  `branchProb` overrides an edge's probability; `inject` spawns tokens.
   *  All changes are engine-local so replications stay independent. */
  private applyPlanned(iv: IvPayload): void {
    switch (iv.kind) {
      case "capacity":
      case "outage": {
        const pool = this.pools.get(iv.target);
        if (!pool) return;
        const prev = pool.currentCapacity;
        for (const p of pool.setCapacity(this.clock, Math.max(0, Math.round(iv.value)))) {
          const t = this.tokens.get(p.tokenId), n = this.nodeById.get(p.nodeId);
          if (t && n) this.startService(t, n, this.clock - p.requestedAt);
        }
        if (iv.duration && iv.duration > 0) this.scheduleRevert(iv.target, { kind: "capacity", target: iv.target, value: prev }, iv.duration);
        break;
      }
      case "arrival": {
        const prev = this.arrivalMult.get(iv.target) ?? 1;
        this.arrivalMult.set(iv.target, iv.value);
        if (iv.duration && iv.duration > 0) this.scheduleRevert(iv.target, { kind: "arrival", target: iv.target, value: prev }, iv.duration);
        break;
      }
      case "branchProb": {
        // A revert carries NaN → drop the override and fall back to the edge's
        // own probability.
        if (Number.isNaN(iv.value)) { this.edgeProb.delete(iv.target); break; }
        const prev = this.edgeProb.has(iv.target) ? this.edgeProb.get(iv.target)! : NaN;
        this.edgeProb.set(iv.target, iv.value);
        if (iv.duration && iv.duration > 0) this.scheduleRevert(iv.target, { kind: "branchProb", target: iv.target, value: prev }, iv.duration);
        break;
      }
      case "inject":
        this.applyIntervention({ kind: "inject", nodeId: iv.target, count: Math.max(0, Math.round(iv.value)) });
        break;
    }
  }

  /** Schedule the revert of a timed change `duration` clock-units from now. */
  private scheduleRevert(target: string, payload: IvPayload, duration: number): void {
    this.calendar.schedule(this.clock + duration, { type: "INTERVENTION", nodeId: target, iv: payload });
  }

  /** Apply a live Operator lever at the current clock — mutates running state,
   *  then continues deterministically (the basis of "fork the timeline"). */
  applyIntervention(iv: Intervention): void {
    if (iv.kind === "capacity") {
      const pool = this.pools.get(iv.teamId);
      if (!pool) return;
      for (const p of pool.setCapacity(this.clock, iv.capacity)) {
        const t = this.tokens.get(p.tokenId), n = this.nodeById.get(p.nodeId);
        if (t && n) this.startService(t, n, this.clock - p.requestedAt);
      }
    } else if (iv.kind === "inject") {
      for (let i = 0; i < iv.count; i++) {
        const token: Token = { id: `t${this.nextTokenId++}`, enteredAt: this.clock, props: this.initProps(), callStack: [] };
        this.tokens.set(token.id, token);
        if (this.warmedUp) this.arrived++;
        this.emit("spawn", token.id, iv.nodeId);
        this.enterNode(token, iv.nodeId);
      }
    }
  }

  get now(): number { return this.clock; }
}

// Re-export so callers can type pool queue payloads if needed.
export type { QueuedRequest };
