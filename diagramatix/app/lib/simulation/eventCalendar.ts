/**
 * Binary min-heap event calendar — the core of the discrete-event loop.
 *
 * Ordered by event `time`, with the monotonic insertion `seq` as a strict
 * tie-break so events scheduled for the same instant fire in insertion order.
 * That determinism is essential for reproducible Monte-Carlo + the Operator
 * snapshot/resume. The heap is serialisable (`toJSON`/`fromJSON`) so it can be
 * captured into a SimState snapshot.
 */

import type { ScheduledEvent } from "./types";

export class EventCalendar<P = unknown> {
  private heap: ScheduledEvent<P>[] = [];
  private seqCounter = 0;

  get size(): number {
    return this.heap.length;
  }

  /** Schedule `payload` at absolute time `time`. Returns the assigned seq. */
  schedule(time: number, payload: P): number {
    const seq = this.seqCounter++;
    this.heap.push({ time, seq, payload });
    this.bubbleUp(this.heap.length - 1);
    return seq;
  }

  peek(): ScheduledEvent<P> | undefined {
    return this.heap[0];
  }

  /** Pop the earliest event (time asc, then seq asc). */
  pop(): ScheduledEvent<P> | undefined {
    const n = this.heap.length;
    if (n === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (n > 1) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  private less(a: ScheduledEvent<P>, b: ScheduledEvent<P>): boolean {
    return a.time < b.time || (a.time === b.time && a.seq < b.seq);
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(this.heap[i], this.heap[parent])) {
        [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
        i = parent;
      } else break;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    for (;;) {
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      let smallest = i;
      if (l < n && this.less(this.heap[l], this.heap[smallest])) smallest = l;
      if (r < n && this.less(this.heap[r], this.heap[smallest])) smallest = r;
      if (smallest === i) break;
      [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
      i = smallest;
    }
  }

  /** Serialise the full calendar state (for SimState snapshot). */
  toJSON(): { heap: ScheduledEvent<P>[]; seqCounter: number } {
    return { heap: this.heap.map((e) => ({ ...e })), seqCounter: this.seqCounter };
  }

  /** Rebuild a calendar from a snapshot. */
  static fromJSON<P>(state: { heap: ScheduledEvent<P>[]; seqCounter: number }): EventCalendar<P> {
    const cal = new EventCalendar<P>();
    cal.heap = state.heap.map((e) => ({ ...e }));
    cal.seqCounter = state.seqCounter;
    return cal;
  }
}
