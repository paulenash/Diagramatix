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

  it("Tier 2 — working-time durations use an 8h day / 5-day week", () => {
    expect(parseTimerLabel("10 working days")).toEqual({ mode: "working", minutes: 10 * 8 * 60 });
    expect(parseTimerLabel("3 business hours")).toEqual({ mode: "working", minutes: 180 });
    expect(parseTimerLabel("1 working week")).toEqual({ mode: "working", minutes: 5 * 8 * 60 });
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
    expect(timerDelayMinutes("10 working days")).toBe(4800);
    expect(timerDelayMinutes("until 3pm")).toBeNull(); // absolute tier not fillable yet
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
