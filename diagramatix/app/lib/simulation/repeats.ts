/**
 * Repeat / multi-instance semantics for an ACTIVITY — the single definition
 * shared by "Fill missing", the Simulation Data panel and the assembler.
 *
 * A repeat marker on an activity means the work happens more than once, so the
 * model needs a COUNT, and a count is a distribution like any other duration
 * ("about 3, sometimes 6" is far commoner than exactly 3).
 *
 * Historically the count was invisible: `loopOf` fell back to a hardcoded
 * `fixed 2` (loop) / `fixed 3` (multi-instance) whenever `sim.loop` was absent,
 * and nothing in the app could set `sim.loop` — so every marked activity in
 * every model silently ran that made-up number of times. These defaults are
 * still the starting point, but they are now WRITTEN to the element by Fill
 * missing, so the number is on screen and editable instead of hidden.
 */

import type { DiagramElement, RepeatType } from "@/app/lib/diagram/types";
import { getSimParams, type LoopParams, type SimDist } from "@/app/lib/diagram/simParams";

/** Activities that can carry a repeat marker. */
const ACTIVITY_TYPES = new Set(["task", "subprocess", "subprocess-expanded"]);

/** The starting count for a marker, used when the element carries no explicit
 *  loop parameters yet. Kept as the historical values so existing models don't
 *  change behaviour the moment the count becomes visible. */
export const DEFAULT_REPEAT_COUNT: SimDist = { kind: "fixed", value: 3 };
export const DEFAULT_LOOP_COUNT: SimDist = { kind: "fixed", value: 2 };

/** Does this element repeat — either by marker or by explicit loop parameters? */
export function hasRepeat(el: DiagramElement): boolean {
  if (!ACTIVITY_TYPES.has(el.type)) return false;
  if (getSimParams(el).loop) return true;
  const rt = el.repeatType;
  return !!rt && rt !== "none";
}

/** How many times the work happens, as a distribution — or undefined when the
 *  element doesn't repeat. Reads explicit loop params first, else the marker. */
export function repeatCountOf(el: DiagramElement): SimDist | undefined {
  const loop = getSimParams(el).loop;
  if (loop) return loop.kind === "standard" ? loop.iterations ?? DEFAULT_LOOP_COUNT : loop.instances;
  if (!hasRepeat(el)) return undefined;
  return el.repeatType === "loop" ? DEFAULT_LOOP_COUNT : DEFAULT_REPEAT_COUNT;
}

/** Are the repeats run one after another (so each pass re-seizes the resource
 *  and other work can interleave) or all at once? */
export function isSequentialRepeat(el: DiagramElement): boolean {
  const loop = getSimParams(el).loop;
  if (loop) return loop.kind === "standard" || loop.ordering === "sequential";
  return el.repeatType !== "mi-parallel";
}

/**
 * A repeat count this large is a data error, not a model. The engine clamps at
 * 10,000 passes so a runaway count can't exhaust memory mid-run — but a clamp
 * that fires SILENTLY would quietly change the answer, so anything approaching
 * it is reported here instead, before the run, where it can be corrected.
 *
 * `undefined` means "sane". Otherwise the representative size, so the message
 * can name the number the user actually typed.
 */
export const IMPLAUSIBLE_REPEAT_COUNT = 1000;
export function implausibleRepeatCount(el: DiagramElement): number | undefined {
  const d = repeatCountOf(el);
  if (!d) return undefined;
  // The largest value the distribution realistically produces.
  const size =
    d.kind === "fixed" ? d.value
    : d.kind === "uniform" ? d.max
    : d.kind === "triangular" ? d.max
    : d.kind === "normal" ? d.mean + 3 * d.sd
    : d.mean; // exponential — the mean already implies a long tail
  return Number.isFinite(size) && size > IMPLAUSIBLE_REPEAT_COUNT ? Math.round(size) : undefined;
}

/** The LoopParams an element should carry for its marker, for Fill missing to
 *  write so the count stops being an invisible default. */
export function loopParamsForMarker(rt: RepeatType | undefined, count: SimDist): LoopParams | undefined {
  switch (rt) {
    case "loop": return { kind: "standard", iterations: count };
    case "mi-sequential": return { kind: "multi", instances: count, ordering: "sequential" };
    case "mi-parallel": return { kind: "multi", instances: count, ordering: "parallel" };
    default: return undefined;
  }
}
