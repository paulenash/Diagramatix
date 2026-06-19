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
 */

export interface QueuedRequest<R> {
  units: number;
  payload: R;
}

export interface PoolStats {
  utilization: number; // busy-unit-time / capacity-unit-time (0..1)
  avgQueue: number;    // time-weighted mean queue length
  maxQueue: number;
}

export interface PoolState<R> {
  capacity: number;
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
  private busyUnits = 0;
  private queue: QueuedRequest<R>[] = [];
  // Time-weighted integrals, accrued before every state change.
  private busyArea = 0;
  private queueArea = 0;
  private capacityArea = 0;
  private maxQueue = 0;
  private lastUpdate = 0;
  private statsStart = 0;

  constructor(capacity: number, now = 0) {
    this.capacity = Math.max(0, capacity);
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
   *  if it was queued (the engine will be handed the payload again on release). */
  request(now: number, units: number, payload: R): boolean {
    this.accrue(now);
    if (this.busyUnits + units <= this.capacity) {
      this.busyUnits += units;
      return true;
    }
    this.queue.push({ units, payload });
    if (this.queue.length > this.maxQueue) this.maxQueue = this.queue.length;
    return false;
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
    };
  }

  toJSON(): PoolState<R> {
    return {
      capacity: this.capacity, busyUnits: this.busyUnits,
      queue: this.queue.map((q) => ({ ...q })),
      busyArea: this.busyArea, queueArea: this.queueArea, capacityArea: this.capacityArea,
      maxQueue: this.maxQueue, lastUpdate: this.lastUpdate, statsStart: this.statsStart,
    };
  }

  static fromJSON<R>(s: PoolState<R>): ResourcePool<R> {
    const p = new ResourcePool<R>(s.capacity, s.lastUpdate);
    p.busyUnits = s.busyUnits;
    p.queue = s.queue.map((q) => ({ ...q }));
    p.busyArea = s.busyArea; p.queueArea = s.queueArea; p.capacityArea = s.capacityArea;
    p.maxQueue = s.maxQueue; p.lastUpdate = s.lastUpdate; p.statsStart = s.statsStart;
    return p;
  }
}
