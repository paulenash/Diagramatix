/**
 * "Use diagram values" — copying the documented CT/WT + gateway branch shares a
 * BPMN diagram already carries into the simulation model.
 */
import { describe, it, expect } from "vitest";
import { useDiagramValues, hasDiagramValues, convertToClockUnit } from "@/app/lib/simulation/useDiagramValues";
import { getSimParams } from "@/app/lib/diagram/simParams";
import type { DiagramData } from "@/app/lib/diagram/types";

const task = (id: string, props: Record<string, unknown>) => ({
  id, type: "task", label: id, x: 0, y: 0, width: 100, height: 60, properties: props,
});

const diagram = (els: unknown[], conns: unknown[] = []): DiagramData =>
  ({ elements: els, connectors: conns } as unknown as DiagramData);

describe("convertToClockUnit", () => {
  it("converts between authored unit and clock unit", () => {
    expect(convertToClockUnit(2, "hour", "minute")).toEqual({ value: 120, converted: true });
    expect(convertToClockUnit(90, "minute", "hour")).toEqual({ value: 1.5, converted: true });
    expect(convertToClockUnit(1, "day", "hour")).toEqual({ value: 24, converted: true });
  });

  it("accepts the short and plural spellings the picker can produce", () => {
    expect(convertToClockUnit(1, "hours", "minute").value).toBe(60);
    expect(convertToClockUnit(1, "hr", "minute").value).toBe(60);
    expect(convertToClockUnit(1, "Minutes", "second").value).toBe(60);
  });

  it("passes a value through unconverted when the unit is unset or free-text", () => {
    // Better to take the number at face value and SAY so than to guess.
    expect(convertToClockUnit(5, undefined, "minute")).toEqual({ value: 5, converted: false });
    expect(convertToClockUnit(5, "none", "minute")).toEqual({ value: 5, converted: false });
    expect(convertToClockUnit(5, "fortnights", "minute")).toEqual({ value: 5, converted: false });
  });
});

describe("useDiagramValues", () => {
  it("copies CT/WT into the sim model as fixed distributions, unit-converted", () => {
    const d = diagram([task("t1", { cycleTime: 2, waitTime: 1, timeUnit: "hour" })]);
    const r = useDiagramValues(d, "minute");

    expect(r.cycleTimes).toBe(1);
    expect(r.waitTimes).toBe(1);
    const sim = getSimParams(r.data.elements[0]);
    // A single documented number becomes a FIXED distribution — inventing a
    // spread around it would be inventing data.
    expect(sim.cycleTime).toEqual({ kind: "fixed", value: 120 });
    expect(sim.waitTime).toEqual({ kind: "fixed", value: 60 });
  });

  it("reports values it could not convert instead of silently guessing", () => {
    const d = diagram([task("t1", { cycleTime: 5 })]);
    const r = useDiagramValues(d, "minute");
    expect(r.unconverted).toBe(1);
    expect(getSimParams(r.data.elements[0]).cycleTime).toEqual({ kind: "fixed", value: 5 });
  });

  it("leaves an already-tuned sim value alone by default", () => {
    const d = diagram([task("t1", {
      cycleTime: 2, timeUnit: "hour",
      sim: { cycleTime: { kind: "triangular", min: 3, mode: 5, max: 8 } },
    })]);
    const r = useDiagramValues(d, "minute");

    expect(r.cycleTimes).toBe(0);
    expect(r.skipped).toBe(1);
    expect(getSimParams(r.data.elements[0]).cycleTime).toEqual({ kind: "triangular", min: 3, mode: 5, max: 8 });
  });

  it("overwrites when the diagram is made authoritative", () => {
    const d = diagram([task("t1", {
      cycleTime: 2, timeUnit: "hour",
      sim: { cycleTime: { kind: "triangular", min: 3, mode: 5, max: 8 } },
    })]);
    const r = useDiagramValues(d, "minute", { overwrite: true });

    expect(r.cycleTimes).toBe(1);
    expect(getSimParams(r.data.elements[0]).cycleTime).toEqual({ kind: "fixed", value: 120 });
  });

  it("copies gateway branch shares into branch probabilities", () => {
    const d = diagram(
      [task("t1", {})],
      [
        { id: "cA", sourceId: "gw", targetId: "a", waypoints: [], branchPercent: 90 },
        { id: "cB", sourceId: "gw", targetId: "b", waypoints: [], branchPercent: 30 },
        { id: "cD", sourceId: "gw", targetId: "d", waypoints: [], isDefaultFlow: true },
      ],
    );
    const r = useDiagramValues(d, "minute");

    expect(r.branches).toBe(2);
    // Inclusive shares are independent, so 90 + 30 is carried through as-is
    // rather than normalised to 100.
    expect(r.data.connectors[0].branchProbability).toBe(90);
    expect(r.data.connectors[1].branchProbability).toBe(30);
    // The default flow has no share and is untouched.
    expect(r.data.connectors[2].branchProbability).toBeUndefined();
  });

  it("ignores zero and negative documented times", () => {
    const d = diagram([task("t1", { cycleTime: 0, waitTime: -3, timeUnit: "hour" })]);
    const r = useDiagramValues(d, "minute");
    expect(r.cycleTimes).toBe(0);
    expect(r.waitTimes).toBe(0);
    expect(getSimParams(r.data.elements[0]).cycleTime).toBeUndefined();
  });

  it("leaves elements with nothing documented untouched (same object)", () => {
    const d = diagram([task("t1", { label: "x" })]);
    const r = useDiagramValues(d, "minute");
    expect(r.data.elements[0]).toBe(d.elements[0]);
  });
});

describe("hasDiagramValues", () => {
  it("is true when anything is documented, false otherwise", () => {
    expect(hasDiagramValues(diagram([task("t1", { cycleTime: 5 })]))).toBe(true);
    expect(hasDiagramValues(diagram([task("t1", { waitTime: 5 })]))).toBe(true);
    expect(hasDiagramValues(diagram([], [{ id: "c", sourceId: "a", targetId: "b", waypoints: [], branchPercent: 50 }]))).toBe(true);
    expect(hasDiagramValues(diagram([task("t1", { label: "x" })]))).toBe(false);
  });
});
