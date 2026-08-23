import { describe, it, expect } from "vitest";
import { parseTimerLabel, timerDelayMinutes } from "@/app/lib/simulation/timerLabel";
import { autofillSimulation } from "@/app/lib/simulation/autofill";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

/**
 * T2847 — timer-label parsing (three tiers) + autofill wiring.
 * Elapsed durations and working-time durations become a minute magnitude;
 * absolute "until" times are recognised as a time-of-day.
 */
describe("parseTimerLabel", () => {
  it("Tier 1 — fixed elapsed durations, any common spelling", () => {
    expect(parseTimerLabel("Wait 3 hours")).toEqual({ mode: "elapsed", minutes: 180 });
    expect(parseTimerLabel("Wait 7 days")).toEqual({ mode: "elapsed", minutes: 7 * 1440 });
    expect(parseTimerLabel("90 min")).toEqual({ mode: "elapsed", minutes: 90 });
    expect(parseTimerLabel("1.5h")).toEqual({ mode: "elapsed", minutes: 90 });
    expect(parseTimerLabel("2 weeks")).toEqual({ mode: "elapsed", minutes: 2 * 10080 });
    expect(parseTimerLabel("45 seconds")).toEqual({ mode: "elapsed", minutes: 0.75 });
  });

  // Working DAYS and working HOURS are different rules, because the phrase means
  // two different things. "7 working days" is seven 24-hour periods with the
  // closed days stepped over — a deadline set at 3pm still falls due at 3pm, and
  // the length of the working day is irrelevant to it. "3 working hours" is three
  // hours of actual open time. This previously multiplied days by an assumed 8h
  // day, which silently made the answer depend on the calendar's shift length.
  it("Tier 2a — working DAYS count days, not hours", () => {
    expect(parseTimerLabel("10 working days")).toEqual({ mode: "working-days", days: 10 });
    expect(parseTimerLabel("1 working week")).toEqual({ mode: "working-days", days: 5 });
    expect(parseTimerLabel("7 business days")).toEqual({ mode: "working-days", days: 7 });
  });

  it("Tier 2b — working HOURS consume open time", () => {
    expect(parseTimerLabel("3 business hours")).toEqual({ mode: "working", minutes: 180 });
    expect(parseTimerLabel("90 working minutes")).toEqual({ mode: "working", minutes: 90 });
  });

  it("an unqualified duration is ELAPSED, whatever the unit", () => {
    expect(parseTimerLabel("2 days")).toEqual({ mode: "elapsed", minutes: 2880 });
    expect(parseTimerLabel("2 hours")).toEqual({ mode: "elapsed", minutes: 120 });
  });

  it("Tier 3 — absolute time-of-day, 12h and 24h", () => {
    expect(parseTimerLabel("until 3pm")).toEqual({ mode: "until", timeOfDay: "15:00" });
    expect(parseTimerLabel("by 17:00")).toEqual({ mode: "until", timeOfDay: "17:00" });
    expect(parseTimerLabel("until 9:30am")).toEqual({ mode: "until", timeOfDay: "09:30" });
    expect(parseTimerLabel("until 12am")).toEqual({ mode: "until", timeOfDay: "00:00" });
    expect(parseTimerLabel("until 12pm")).toEqual({ mode: "until", timeOfDay: "12:00" });
  });

  it("returns null for labels with no duration, and timerDelayMinutes skips 'until'", () => {
    expect(parseTimerLabel("Review complete")).toBeNull();
    expect(parseTimerLabel("")).toBeNull();
    expect(timerDelayMinutes("Wait 3 hours")).toBe(180);
    // A working-DAY value is a day count, not minutes, so it has no minute
    // magnitude to report — same as "until".
    expect(timerDelayMinutes("10 working days")).toBeNull();
    expect(timerDelayMinutes("3 working hours")).toBe(180);
    expect(timerDelayMinutes("until 3pm")).toBeNull(); // "until" has no minute magnitude (engine uses delayUntil)
  });
});

describe("autofillSimulation — timer delays from labels", () => {
  const timerDiagram = (label: string): DiagramData => ({
    viewport: { x: 0, y: 0, zoom: 1 },
    elements: [
      { id: "w", type: "intermediate-event", x: 0, y: 0, width: 40, height: 40, label, properties: {} },
    ],
    connectors: [],
  } as unknown as DiagramData);

  it("fills a timer's delay from its label instead of the flat default", () => {
    const { data } = autofillSimulation(timerDiagram("Wait 3 hours"));
    expect(getSimParams(data.elements[0]).delay).toEqual({ kind: "fixed", value: 180 });
  });

  it("falls back to the default delay when the label has no duration", () => {
    const { data } = autofillSimulation(timerDiagram("Approval received"));
    expect(getSimParams(data.elements[0]).delay).toEqual({ kind: "fixed", value: 2 });
  });
});
