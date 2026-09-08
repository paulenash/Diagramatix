/**
 * A shared team resource pool — the heart of contention-driven simulation.
 *
 * A task SEIZES `units` from its team's pool; if the pool is full the request
 * joins a FIFO queue, and that queueing is exactly where WAIT TIME comes from.
 * On RELEASE the freed capacity is handed to the next waiting request(s).
 *
 * One pool per distinct teamId across the whole portfolio ⇒ cross-process
 * contention. Time-weighted utilisation + queue stats are accrued on every
 * state change (so they're exact, not sampled). The pool is fully serialisable
 * for SimState snapshot/resume, and `setCapacity` is the live Operator lever.
 *
 * QUEUE DISCIPLINE. Real departments are not first-in-first-out: urgent cases
 * jump, complaints have a clock, someone is always expediting. The queue can
 * therefore be ordered by priority or by shortest-job-first as well as by
 * arrival. FIFO is the DEFAULT and is bit-identical to the behaviour before
 * disciplines existed — a model that declares nothing runs exactly as it did.
 *
 * Ordering is always stable and deterministic: every request carries a monotonic
 * arrival sequence, which breaks ties inside equal priority (so a priority queue
 * is FIFO within each priority) and keeps a run reproducible.
 *
 * Head-of-line blocking is DELIBERATELY kept: if the request at the front does
 * not fit, nothing behind it is served, even if it would. Serving past a blocked
 * head would change every existing model's results and quietly turn a queue into
 * something no department would recognise.
 *
 * SKILLS. A pool may instead hold NAMED UNITS, each with a set of skills, and a
 * request may require skills that only some of them hold. Two constraints then
 * apply independently:
 *
 *   capacity — how many may work at once. UNCHANGED, so the calendar can still
 *              close a team to zero and interventions still work.
 *   units    — WHO may take WHICH work.
 *
 * Conflating the two would have broken the calendar cap for every skilled team,
 * silently. A pool with no units declared behaves exactly as it always did.
 *
 * Two rules only apply in the skilled path:
 *
 *  - LEAST FLEXIBLE FIRST. Among those who qualify, serve with the one holding
 *    the fewest skills, so the person who can cover anything stays free for the
 *    work only they can do. Ties break on unit id, so a run stays reproducible.
 *  - SKILL-AWARE SKIPPING. The pool serves the first request IN QUEUE ORDER that
 *    has an eligible free person, rather than stopping at a head nobody can
 *    serve. Strict blocking would leave someone idle while work they could do sat
 *    behind work they could not — which would make the feature UNDERSTATE the
 *    value of cross-skilling, the very thing it exists to quantify. This is the
 *    one place skills deliberately diverge from the counted pool's rule.
 */

/** One named person in a pool. `skills` is what they can do; empty means they
 *  can take only work that requires nothing in particular. */
export interface PoolUnit {
  id: string;
  name?: string;
  skills: string[];
}

/** How a pool chooses who to serve next when capacity frees up. */
export type QueueDiscipline = "fifo" | "priority" | "shortest-first";

export interface QueuedRequest<R> {
  units: number;
  payload: R;
  /** Higher is served sooner. Absent = 0, so an unprioritised model is FIFO. */
  priority?: number;
  /** Expected service time, for shortest-first. Absent sorts last, because a job
   *  of unknown length must not jump ahead of one known to be short. */
  serviceEstimate?: number;
  /** Skills the work needs. ALL must be held (AND). Empty/absent = anyone. */
  requiredSkills?: string[];
  /** Caller's handle for the holder, so the units assigned to it can be freed
   *  again on release. The engine passes the token id. */
  key?: string;
  /** Monotonic arrival order — the stable tie-break, and what keeps a priority
   *  queue FIFO within each priority. */
  seq: number;
}

export interface PoolStats {
  utilization: number; // busy-unit-time / capacity-unit-time (0..1)
  avgQueue: number;    // time-weighted mean queue length
  maxQueue: number;
  busyTime: number;    // busy-unit-time in clock units (∑ busyUnits·Δt) — drives cost
}

export interface PoolState<R> {
  capacity: number;
  discipline?: QueueDiscipline;
  seqCounter?: number;
  units?: PoolUnit[];
  /** key → the unit ids that holder is occupying. */
  assigned?: Record<string, string[]>;
  busyUnits: number;
  queue: QueuedRequest<R>[];
  busyArea: number;
  queueArea: number;
  capacityArea: number;
  maxQueue: number;
  lastUpdate: number;
  statsStart: number;
}

export class ResourcePool<R = unknown> {
  private capacity: number;
  private discipline: QueueDiscipline;
  /** Named people, when the team declares them. Empty = a counted pool. */
  private units: PoolUnit[] = [];
  /** key → unit ids currently held, so a release frees the right people. */
  private assigned = new Map<string, string[]>();
  /** Monotonic, so ordering never depends on array identity or insertion timing. */
  private seqCounter = 0;
  /** The pool's current size. Read by the engine to decide how many instances
   *  of a parallel multi-instance activity can actually overlap. */
  get size(): number { return this.capacity; }
  private busyUnits = 0;
  private queue: QueuedRequest<R>[] = [];
  // Time-weighted integrals, accrued before every state change.
  private busyArea = 0;
  private queueArea = 0;
  private capacityArea = 0;
  private maxQueue = 0;
  private lastUpdate = 0;
  private statsStart = 0;

  constructor(capacity: number, now = 0, discipline: QueueDiscipline = "fifo", units: PoolUnit[] = []) {
    this.capacity = Math.max(0, capacity);
    this.discipline = discipline;
    this.units = units.map((u) => ({ ...u, skills: [...(u.skills ?? [])] }));
    this.lastUpdate = now;
    this.statsStart = now;
  }

  get currentCapacity(): number { return this.capacity; }
  get busy(): number { return this.busyUnits; }
  get queueLength(): number { return this.queue.length; }
  get available(): number { return Math.max(0, this.capacity - this.busyUnits); }

  /** Integrate the time-weighted areas up to `now`, using the values that held
   *  over [lastUpdate, now]. Always call before mutating capacity/busy/queue. */
  private accrue(now: number): void {
    const dt = now - this.lastUpdate;
    if (dt > 0) {
      this.busyArea += this.busyUnits * dt;
      this.queueArea += this.queue.length * dt;
      this.capacityArea += this.capacity * dt;
    }
    this.lastUpdate = now;
  }

  /** Does this pool track named people at all? */
  get skilled(): boolean { return this.units.length > 0; }

  /** Unit ids currently occupied by somebody. */
  private busyUnitIds(): Set<string> {
    const held = new Set<string>();
    for (const ids of this.assigned.values()) for (const id of ids) held.add(id);
    return held;
  }

  /** The `n` free people who qualify, LEAST FLEXIBLE FIRST — so the person who
   *  can cover anything stays free for the work only they can do. Returns null
   *  when fewer than `n` qualify, which is what makes the request wait. */
  private pickUnits(n: number, requiredSkills?: string[]): string[] | null {
    const need = requiredSkills ?? [];
    const held = this.busyUnitIds();
    const eligible = this.units
      .filter((u) => !held.has(u.id) && need.every((sk) => u.skills.includes(sk)))
      .sort((a, b) => a.skills.length - b.skills.length || a.id.localeCompare(b.id));
    return eligible.length >= n ? eligible.slice(0, n).map((u) => u.id) : null;
  }

  /** Request `units` for `payload`. Returns true if granted immediately, false
   *  if it was queued (the engine will be handed the payload again on release).
   *  `opts` carries the case's priority and expected service time; both are
   *  ignored under FIFO. */
  request(now: number, units: number, payload: R, opts?: { priority?: number; serviceEstimate?: number; requiredSkills?: string[]; key?: string }): boolean {
    this.accrue(now);
    // BOTH constraints, independently: room to work, and someone who can do it.
    if (this.busyUnits + units <= this.capacity) {
      if (!this.skilled) {
        this.busyUnits += units;
        return true;
      }
      const picked = this.pickUnits(units, opts?.requiredSkills);
      if (picked) {
        this.busyUnits += units;
        if (opts?.key) this.assigned.set(opts.key, picked);
        return true;
      }
    }
    this.enqueue({ units, payload, seq: this.seqCounter++, ...(opts?.priority !== undefined ? { priority: opts.priority } : {}), ...(opts?.serviceEstimate !== undefined ? { serviceEstimate: opts.serviceEstimate } : {}), ...(opts?.requiredSkills?.length ? { requiredSkills: opts.requiredSkills } : {}), ...(opts?.key ? { key: opts.key } : {}) });
    if (this.queue.length > this.maxQueue) this.maxQueue = this.queue.length;
    return false;
  }

  /** Place a request according to the discipline. Stable in every case: equal
   *  keys keep arrival order, so the result never depends on sort implementation. */
  private enqueue(req: QueuedRequest<R>): void {
    if (this.discipline === "fifo") { this.queue.push(req); return; }
    const rank = this.discipline === "priority"
      ? (q: QueuedRequest<R>) => -(q.priority ?? 0)                       // higher priority first
      : (q: QueuedRequest<R>) => (q.serviceEstimate ?? Number.POSITIVE_INFINITY); // shortest first
    const mine = rank(req);
    let i = this.queue.length;
    while (i > 0 && rank(this.queue[i - 1]) > mine) i--;
    this.queue.splice(i, 0, req);
  }

  /** The live lever for queue discipline — changing it re-orders those already
   *  waiting, which is what actually happens when a department starts triaging. */
  setDiscipline(now: number, discipline: QueueDiscipline): void {
    this.accrue(now);
    this.discipline = discipline;
    if (discipline === "fifo") { this.queue.sort((a, b) => a.seq - b.seq); return; }
    const waiting = [...this.queue];
    this.queue = [];
    for (const q of waiting.sort((a, b) => a.seq - b.seq)) this.enqueue(q);
  }

  /** Release `units`; greedily grant queued requests that now fit (FIFO).
   *  Returns the payloads that were just granted so the engine can start them. */
  release(now: number, units: number, key?: string): R[] {
    this.accrue(now);
    this.busyUnits = Math.max(0, this.busyUnits - units);
    // Free the specific people, not just the count.
    if (key) this.assigned.delete(key);
    return this.drainQueue();
  }

  /** Live Operator lever: change capacity, then grant anything newly fitting. */
  setCapacity(now: number, capacity: number): R[] {
    this.accrue(now);
    this.capacity = Math.max(0, capacity);
    return this.drainQueue();
  }

  private drainQueue(): R[] {
    const granted: R[] = [];
    if (!this.skilled) {
      // Counted pool: strict head-of-line blocking, exactly as before.
      while (this.queue.length > 0 && this.busyUnits + this.queue[0].units <= this.capacity) {
        const req = this.queue.shift()!;
        this.busyUnits += req.units;
        granted.push(req.payload);
      }
      return granted;
    }
    // Skilled pool: serve the first request IN QUEUE ORDER that somebody free can
    // actually do. Stopping at an unservable head would leave a qualified person
    // idle and make cross-skilling look worthless (see the header).
    for (;;) {
      const i = this.queue.findIndex(
        (q) => this.busyUnits + q.units <= this.capacity && this.pickUnits(q.units, q.requiredSkills) !== null,
      );
      if (i < 0) return granted;
      const [req] = this.queue.splice(i, 1);
      const picked = this.pickUnits(req.units, req.requiredSkills)!;
      this.busyUnits += req.units;
      if (req.key) this.assigned.set(req.key, picked);
      granted.push(req.payload);
    }
  }

  /** Remove queued requests whose payload matches `pred` (an interrupted token
   *  that was waiting in line). Granted/in-service holders are unaffected. */
  cancelWhere(now: number, pred: (payload: R) => boolean): void {
    this.accrue(now);
    // A cancelled request that was still WAITING holds nobody, but drop any
    // assignment recorded against it so a person is never left occupied by a
    // token that no longer exists.
    for (const q of this.queue) if (pred(q.payload) && q.key) this.assigned.delete(q.key);
    this.queue = this.queue.filter((q) => !pred(q.payload));
  }

  /** Restart statistics from `now` (used at warm-up end). */
  resetStats(now: number): void {
    this.accrue(now);
    this.busyArea = 0;
    this.queueArea = 0;
    this.capacityArea = 0;
    this.maxQueue = this.queue.length;
    this.statsStart = now;
  }

  /** Final time-weighted metrics as of `now`. */
  stats(now: number): PoolStats {
    this.accrue(now);
    const elapsed = now - this.statsStart;
    return {
      utilization: this.capacityArea > 0 ? this.busyArea / this.capacityArea : 0,
      avgQueue: elapsed > 0 ? this.queueArea / elapsed : 0,
      maxQueue: this.maxQueue,
      busyTime: this.busyArea,
    };
  }

  toJSON(): PoolState<R> {
    return {
      capacity: this.capacity, discipline: this.discipline, seqCounter: this.seqCounter,
      ...(this.units.length ? { units: this.units.map((u) => ({ ...u, skills: [...u.skills] })) } : {}),
      ...(this.assigned.size ? { assigned: Object.fromEntries(this.assigned) } : {}),
      busyUnits: this.busyUnits,
      queue: this.queue.map((q) => ({ ...q })),
      busyArea: this.busyArea, queueArea: this.queueArea, capacityArea: this.capacityArea,
      maxQueue: this.maxQueue, lastUpdate: this.lastUpdate, statsStart: this.statsStart,
    };
  }

  static fromJSON<R>(s: PoolState<R>): ResourcePool<R> {
    // An older snapshot has neither field; FIFO and a fresh counter reproduce
    // exactly what that snapshot was doing when it was taken.
    const p = new ResourcePool<R>(s.capacity, s.lastUpdate, s.discipline ?? "fifo", s.units ?? []);
    p.seqCounter = s.seqCounter ?? 0;
    p.assigned = new Map(Object.entries(s.assigned ?? {}).map(([k, v]) => [k, [...v]]));
    p.busyUnits = s.busyUnits;
    p.queue = s.queue.map((q) => ({ ...q }));
    p.busyArea = s.busyArea; p.queueArea = s.queueArea; p.capacityArea = s.capacityArea;
    p.maxQueue = s.maxQueue; p.lastUpdate = s.lastUpdate; p.statsStart = s.statsStart;
    return p;
  }
}
