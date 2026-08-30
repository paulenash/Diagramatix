/**
 * Effort and frequency onto a diagram, so a partner-created process arrives
 * RUNNABLE rather than merely drawn.
 *
 * A partner collects two numbers — minutes per run, runs per month — because an
 * automation-readiness score needs them. Diagramatix already separates a
 * DOCUMENTED value (`properties.cycleTime` + `timeUnit`, what the Properties
 * panel shows) from a SIMULATION value (`properties.sim.cycleTime`, a
 * distribution). Writing both means the diagram opens with numbers a human can
 * see AND a simulation that will run — which is the moment the integration stops
 * being a drawing service.
 *
 * EQUAL-SPLITTING ONE AGGREGATE ACROSS TASKS IS A FICTION. It is the only honest
 * move available with a single number, but it must be labelled rather than
 * passed off as measurement: every value written is marked `autofilled`, which
 * the Properties panel renders differently and the existing "Unfill missing"
 * action can clear, and the derivation is recorded on the diagram and echoed in
 * the API response.
 */
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { arrivalSourcesOf } from "./arrivalSources";

/** Minutes in a month, by convention. Business hours is the default because a
 *  process "running 400 times a month" almost always means during work. */
export const BUSINESS_MINUTES_PER_MONTH = 21 * 7.5 * 60;   // 9,450
export const CALENDAR_MINUTES_PER_MONTH = 30.44 * 24 * 60; // ≈ 43,834

/** Hours one full-time person works in a year, for the FTE headline. Stated
 *  rather than hidden so the number can be argued with. */
export const FTE_HOURS_PER_YEAR = 1_725;

export type VolumetricsBasis = "business" | "calendar";

export interface Volumetrics {
  minutesPerRun?: number;
  runsPerMonth?: number;
  basis?: VolumetricsBasis;
}

export interface VolumetricsDerived {
  hoursPerMonth: number | null;
  hoursPerYear: number | null;
  fteEquivalent: number | null;
  fteHoursPerYear: number;
  minutesPerMonth: number;
  /** The mean gap between arrivals the simulation was given, in minutes. */
  interarrivalMinutes: number | null;
}

export interface VolumetricsResult {
  data: DiagramData;
  applied: { cycleTimes: number; arrivals: number };
  derived: VolumetricsDerived;
  basis: VolumetricsBasis;
  /** Said out loud, because every one of these is an assumption. */
  notes: string[];
}

/** The element types that carry work — the same set the SOP skeleton walks. */
const WORK_TYPES = new Set(["task", "subprocess", "subprocess-expanded", "call-activity", "transaction"]);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function applyVolumetrics(data: DiagramData, v: Volumetrics): VolumetricsResult {
  const basis: VolumetricsBasis = v.basis === "calendar" ? "calendar" : "business";
  const minutesPerMonth = basis === "calendar" ? CALENDAR_MINUTES_PER_MONTH : BUSINESS_MINUTES_PER_MONTH;
  const notes: string[] = [];

  const elements: DiagramElement[] = (data.elements ?? []).map((e) => ({ ...e, properties: { ...e.properties } }));
  const work = elements.filter((e) => WORK_TYPES.has(e.type));

  let cycleTimes = 0;
  if (v.minutesPerRun && v.minutesPerRun > 0 && work.length > 0) {
    const per = round2(v.minutesPerRun / work.length);
    for (const el of work) {
      const props = el.properties as Record<string, unknown>;
      // The DOCUMENTED value — what a person sees in the Properties panel.
      props.cycleTime = per;
      props.timeUnit = "minute";
      // …and the SIMULATION value, so the run works without a second step.
      const sim = (props.sim as Record<string, unknown>) ?? {};
      sim.cycleTime = { kind: "fixed", value: per };
      props.sim = sim;
      // Marked so a human can see at a glance which numbers were derived rather
      // than measured, and clear them with the existing action.
      const filled = new Set([...(Array.isArray(props.autofilled) ? props.autofilled as string[] : [])]);
      filled.add("cycleTime");
      props.autofilled = [...filled];
      cycleTimes++;
    }
    notes.push(
      `${v.minutesPerRun} minutes per run was split equally across ${work.length} ${work.length === 1 ? "activity" : "activities"} (${per} each). That is an assumption, not a measurement — the values are marked as filled in.`,
    );
  } else if (v.minutesPerRun && work.length === 0) {
    notes.push("No activities were found to attach the effort to.");
  }

  let arrivals = 0;
  let interarrivalMinutes: number | null = null;
  if (v.runsPerMonth && v.runsPerMonth > 0) {
    const sources = arrivalSourcesOf({ ...data, elements });
    if (sources.length > 0) {
      // Split the volume across the entry points, so two ways in each get half.
      const perSource = v.runsPerMonth / sources.length;
      interarrivalMinutes = round2(minutesPerMonth / perSource);
      for (const src of sources) {
        const live = elements.find((e) => e.id === src.id);
        if (!live) continue;
        const props = live.properties as Record<string, unknown>;
        const sim = (props.sim as Record<string, unknown>) ?? {};
        sim.arrival = { kind: "exponential", mean: interarrivalMinutes };
        props.sim = sim;
        const filled = new Set([...(Array.isArray(props.autofilled) ? props.autofilled as string[] : [])]);
        filled.add("arrival");
        props.autofilled = [...filled];
        arrivals++;
      }
      notes.push(
        `${v.runsPerMonth} runs a month on a ${basis} basis (${Math.round(minutesPerMonth).toLocaleString()} minutes) is one arrival every ${interarrivalMinutes} minutes${sources.length > 1 ? `, split across ${sources.length} entry points` : ""}.`,
      );
    } else {
      notes.push("No start event was found to attach the arrival rate to.");
    }
  }

  const hoursPerMonth = v.minutesPerRun && v.runsPerMonth
    ? round2((v.minutesPerRun * v.runsPerMonth) / 60)
    : null;
  const hoursPerYear = hoursPerMonth !== null ? round2(hoursPerMonth * 12) : null;

  const out: DiagramData = { ...data, elements };
  // Recorded on the diagram so the derivation travels with it — a number nobody
  // can trace back to its assumption is a number nobody should trust.
  (out as unknown as Record<string, unknown>).volumetrics = {
    minutesPerRun: v.minutesPerRun ?? null,
    runsPerMonth: v.runsPerMonth ?? null,
    basis,
    derivation: "equal-split",
    appliedAt: new Date().toISOString(),
  };

  return {
    data: out,
    applied: { cycleTimes, arrivals },
    basis,
    derived: {
      hoursPerMonth, hoursPerYear,
      fteEquivalent: hoursPerYear !== null ? round2(hoursPerYear / FTE_HOURS_PER_YEAR) : null,
      fteHoursPerYear: FTE_HOURS_PER_YEAR,
      minutesPerMonth: Math.round(minutesPerMonth),
      interarrivalMinutes,
    },
    notes,
  };
}
