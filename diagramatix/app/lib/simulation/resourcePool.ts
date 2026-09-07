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
 */

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

  constructor(capacity: number, now = 0, discipline: QueueDiscipline = "fifo") {
    this.capacity = Math.max(0, capacity);
    this.discipline = discipline;
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

  /** Request `units` for `payload`. Returns true if granted immediately, false
   *  if it was queued (the engine will be handed the payload again on release).
   *  `opts` carries the case's priority and expected service time; both are
   *  ignored under FIFO. */
  request(now: number, units: number, payload: R, opts?: { priority?: number; serviceEstimate?: number }): boolean {
    this.accrue(now);
    if (this.busyUnits + units <= this.capacity) {
      this.busyUnits += units;
      return true;
    }
    this.enqueue({ units, payload, seq: this.seqCounter++, ...(opts?.priority !== undefined ? { priority: opts.priority } : {}), ...(opts?.serviceEstimate !== undefined ? { serviceEstimate: opts.serviceEstimate } : {}) });
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
  release(now: number, units: number): R[] {
    this.accrue(now);
    this.busyUnits = Math.max(0, this.busyUnits - units);
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
    while (this.queue.length > 0 && this.busyUnits + this.queue[0].units <= this.capacity) {
      const req = this.queue.shift()!;
      this.busyUnits += req.units;
      granted.push(req.payload);
    }
    return granted;
  }

  /** Remove queued requests whose payload matches `pred` (an interrupted token
   *  that was waiting in line). Granted/in-service holders are unaffected. */
  cancelWhere(now: number, pred: (payload: R) => boolean): void {
    this.accrue(now);
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
      capacity: this.capacity, discipline: this.discipline, seqCounter: this.seqCounter, busyUnits: this.busyUnits,
      queue: this.queue.map((q) => ({ ...q })),
      busyArea: this.busyArea, queueArea: this.queueArea, capacityArea: this.capacityArea,
      maxQueue: this.maxQueue, lastUpdate: this.lastUpdate, statsStart: this.statsStart,
    };
  }

  static fromJSON<R>(s: PoolState<R>): ResourcePool<R> {
    // An older snapshot has neither field; FIFO and a fresh counter reproduce
    // exactly what that snapshot was doing when it was taken.
    const p = new ResourcePool<R>(s.capacity, s.lastUpdate, s.discipline ?? "fifo");
    p.seqCounter = s.seqCounter ?? 0;
    p.busyUnits = s.busyUnits;
    p.queue = s.queue.map((q) => ({ ...q }));
    p.busyArea = s.busyArea; p.queueArea = s.queueArea; p.capacityArea = s.capacityArea;
    p.maxQueue = s.maxQueue; p.lastUpdate = s.lastUpdate; p.statsStart = s.statsStart;
    return p;
  }
}
