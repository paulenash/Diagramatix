/**
 * Copy the values the DIAGRAM already documents into the SIMULATION model.
 *
 * A BPMN diagram carries process-context attributes that the simulator has
 * always ignored, because they live in different fields with different shapes:
 *
 *   properties.cycleTime     a plain number + properties.timeUnit
 *     → properties.sim.cycleTime   a distribution, in the run's clock unit
 *   properties.waitTime      a plain number + properties.timeUnit
 *     → properties.sim.waitTime
 *   connector.branchPercent  the documented branch share (0..100)
 *     → connector.branchProbability
 *
 * Without this, a diagram that already records real measured times is worthless
 * to the simulator, and ⚙ Fill missing simulation data actively makes it worse:
 * it fills a hardcoded triangular(3,5,8) over the top, and nothing on screen
 * distinguishes an invented 5 minutes from a measured one.
 *
 * A scalar becomes a FIXED distribution — the diagram states one number, so
 * inventing a spread around it would be inventing data.
 */

import type { DiagramData } from "@/app/lib/diagram/types";
import { getSimParams, type ElementSimParams } from "@/app/lib/diagram/simParams";
import { SECONDS_PER_UNIT, type ClockUnit } from "./types";

/** Time units a task's CT/WT can be authored in, as seconds. Mirrors the
 *  Properties panel's unit picker. "none" means the number is already in the
 *  run's clock unit — the safe reading, since we can't guess. */
const UNIT_SECONDS: Record<string, number> = {
  second: 1, seconds: 1, sec: 1, s: 1,
  minute: 60, minutes: 60, min: 60, m: 60,
  hour: 3600, hours: 3600, hr: 3600, h: 3600,
  day: 86400, days: 86400, d: 86400,
  week: 604800, weeks: 604800,
};

/**
 * Convert `value`, expressed in `timeUnit`, into `clockUnit`. An unset or
 * unrecognised unit (including a free-text "other") is taken as already being in
 * the clock unit rather than guessed at — reported so the caller can say so.
 */
export function convertToClockUnit(
  value: number,
  timeUnit: string | undefined,
  clockUnit: ClockUnit,
): { value: number; converted: boolean } {
  const from = timeUnit ? UNIT_SECONDS[timeUnit.trim().toLowerCase()] : undefined;
  if (!from) return { value, converted: false };
  const to = SECONDS_PER_UNIT[clockUnit];
  return { value: (value * from) / to, converted: true };
}

export interface UseDiagramValuesResult {
  data: DiagramData;
  /** Tasks whose cycle time was taken from the diagram. */
  cycleTimes: number;
  /** Tasks whose wait time was taken from the diagram. */
  waitTimes: number;
  /** Gateway edges whose branch share was taken from the diagram. */
  branches: number;
  /** Values copied verbatim because their unit was unset or unrecognised. */
  unconverted: number;
  /** Sim values left alone because `overwrite` was false. */
  skipped: number;
}

/**
 * Apply the diagram's documented values to the simulation model.
 *
 * `overwrite: false` (the default) fills only where the simulation has no value
 * yet, so a model someone has already tuned in the Simulator is not silently
 * reverted to the drawing. `overwrite: true` makes the diagram authoritative.
 */
export function useDiagramValues(
  data: DiagramData,
  clockUnit: ClockUnit = "minute",
  opts: { overwrite?: boolean } = {},
): UseDiagramValuesResult {
  const overwrite = opts.overwrite === true;
  let cycleTimes = 0, waitTimes = 0, branches = 0, unconverted = 0, skipped = 0;

  const elements = data.elements.map((el) => {
    const ct = el.properties?.cycleTime as number | undefined;
    const wt = el.properties?.waitTime as number | undefined;
    if (typeof ct !== "number" && typeof wt !== "number") return el;

    const unit = el.properties?.timeUnit as string | undefined;
    const sim: ElementSimParams = { ...getSimParams(el) };
    let changed = false;

    if (typeof ct === "number" && ct > 0) {
      if (sim.cycleTime && !overwrite) skipped++;
      else {
        const { value, converted } = convertToClockUnit(ct, unit, clockUnit);
        if (!converted) unconverted++;
        sim.cycleTime = { kind: "fixed", value };
        cycleTimes++; changed = true;
      }
    }
    if (typeof wt === "number" && wt > 0) {
      if (sim.waitTime && !overwrite) skipped++;
      else {
        const { value, converted } = convertToClockUnit(wt, unit, clockUnit);
        if (!converted) unconverted++;
        sim.waitTime = { kind: "fixed", value };
        waitTimes++; changed = true;
      }
    }
    return changed ? { ...el, properties: { ...el.properties, sim } } : el;
  });

  const connectors = data.connectors.map((c) => {
    if (typeof c.branchPercent !== "number") return c;
    if (c.branchProbability !== undefined && !overwrite) { skipped++; return c; }
    branches++;
    return { ...c, branchProbability: c.branchPercent };
  });

  return { data: { ...data, elements, connectors }, cycleTimes, waitTimes, branches, unconverted, skipped };
}

/** Is there anything on this diagram for the button to copy? Used to hide the
 *  control entirely rather than offer one that would do nothing. */
export function hasDiagramValues(data: DiagramData): boolean {
  for (const el of data.elements) {
    if (typeof el.properties?.cycleTime === "number") return true;
    if (typeof el.properties?.waitTime === "number") return true;
  }
  return data.connectors.some((c) => typeof c.branchPercent === "number");
}
