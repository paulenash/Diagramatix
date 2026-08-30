/**
 * Effort and frequency onto a diagram.
 *
 * The point is that a partner-created process opens RUNNABLE: Diagramatix
 * already separates a documented value from a simulation value, so writing both
 * means a human sees numbers and a simulation will actually go.
 *
 * T3002 is the one that keeps this honest. Splitting one aggregate equally
 * across tasks is a fiction — the only honest move available with a single
 * number, but a fiction — so every value written is marked `autofilled`, which
 * the Properties panel renders differently and "Unfill missing" can clear. A
 * derived number that cannot be told apart from a measured one is worse than no
 * number.
 */
import { describe, it, expect } from "vitest";
import { layoutBpmnDiagram, type AiElement, type AiConnection } from "@/app/lib/diagram/bpmnLayout";
import {
  applyVolumetrics, BUSINESS_MINUTES_PER_MONTH, CALENDAR_MINUTES_PER_MONTH, FTE_HOURS_PER_YEAR,
} from "@/app/lib/simulation/volumetrics";

/** start → 5 tasks → end, one lane. */
function fiveTasks() {
  const els: AiElement[] = [
    { id: "p", type: "pool", label: "Acme", poolType: "white-box" },
    { id: "s", type: "start-event", label: "Invoice received", pool: "p" },
    { id: "e", type: "end-event", label: "Paid", pool: "p" },
  ];
  const conns: AiConnection[] = [];
  let prev = "s";
  for (let i = 1; i <= 5; i++) {
    els.push({ id: `t${i}`, type: "task", label: `Step ${i}`, pool: "p" });
    conns.push({ sourceId: prev, targetId: `t${i}` });
    prev = `t${i}`;
  }
  conns.push({ sourceId: prev, targetId: "e" });
  return layoutBpmnDiagram(els, conns);
}

const tasksOf = (d: ReturnType<typeof layoutBpmnDiagram>) => d.elements.filter((e) => e.type === "task");

describe("applyVolumetrics", () => {
  it("T3000 — minutes per run are split across the activities, as a DOCUMENTED value", () => {
    const r = applyVolumetrics(fiveTasks(), { minutesPerRun: 25 });
    expect(r.applied.cycleTimes).toBe(5);
    for (const t of tasksOf(r.data)) {
      expect(t.properties.cycleTime).toBe(5);
      expect(t.properties.timeUnit).toBe("minute");
    }
  });

  it("T3001 — and as a SIMULATION value, so the diagram opens runnable", () => {
    // The whole point: no second step between "the API made this" and "you can
    // press play".
    const r = applyVolumetrics(fiveTasks(), { minutesPerRun: 25 });
    for (const t of tasksOf(r.data)) {
      const sim = t.properties.sim as { cycleTime?: { kind: string; value: number } };
      expect(sim?.cycleTime).toEqual({ kind: "fixed", value: 5 });
    }
  });

  it("T3002 — every derived value is marked autofilled, and the fiction is stated", () => {
    const r = applyVolumetrics(fiveTasks(), { minutesPerRun: 25, runsPerMonth: 400 });
    for (const t of tasksOf(r.data)) {
      expect(t.properties.autofilled, `${t.label} must be marked as filled in`).toContain("cycleTime");
    }
    // Said in words, not just in a flag.
    expect(r.notes.join(" ")).toMatch(/assumption, not a measurement/i);
    // And recorded on the diagram, so the derivation travels with it.
    expect((r.data as unknown as { volumetrics: { derivation: string } }).volumetrics.derivation).toBe("equal-split");
  });

  it("T3003 — runs per month become an arrival rate, on a stated basis", () => {
    const business = applyVolumetrics(fiveTasks(), { runsPerMonth: 400 });
    expect(business.applied.arrivals).toBe(1);
    expect(business.basis).toBe("business");
    expect(business.derived.minutesPerMonth).toBe(Math.round(BUSINESS_MINUTES_PER_MONTH));
    expect(business.derived.interarrivalMinutes).toBeCloseTo(BUSINESS_MINUTES_PER_MONTH / 400, 1);

    // A different basis gives a different, documented answer — never silent.
    const calendar = applyVolumetrics(fiveTasks(), { runsPerMonth: 400, basis: "calendar" });
    expect(calendar.derived.minutesPerMonth).toBe(Math.round(CALENDAR_MINUTES_PER_MONTH));
    expect(calendar.derived.interarrivalMinutes).not.toBe(business.derived.interarrivalMinutes);
    expect(calendar.notes.join(" ")).toMatch(/calendar basis/i);
  });

  it("T3004 — the headline numbers an automation score wants, with the divisor stated", () => {
    const r = applyVolumetrics(fiveTasks(), { minutesPerRun: 25, runsPerMonth: 400 });
    expect(r.derived.hoursPerMonth).toBeCloseTo((25 * 400) / 60, 1);
    expect(r.derived.hoursPerYear).toBeCloseTo(((25 * 400) / 60) * 12, 0);
    expect(r.derived.fteEquivalent).toBeCloseTo(r.derived.hoursPerYear! / FTE_HOURS_PER_YEAR, 2);
    // The divisor comes back with the number, so it can be argued with.
    expect(r.derived.fteHoursPerYear).toBe(FTE_HOURS_PER_YEAR);
  });

  it("T3005 — nothing to attach to is reported, not thrown", () => {
    const empty = { elements: [], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } };
    const r = applyVolumetrics(empty, { minutesPerRun: 25, runsPerMonth: 400 });
    expect(r.applied).toEqual({ cycleTimes: 0, arrivals: 0 });
    expect(r.notes.join(" ")).toMatch(/No activities|No start event/i);
  });

  it("T3006 — the original diagram is not mutated", () => {
    // A caller holding the pre-volumetrics data should still have it.
    const original = fiveTasks();
    const before = JSON.stringify(original.elements.map((e) => e.properties));
    applyVolumetrics(original, { minutesPerRun: 25 });
    expect(JSON.stringify(original.elements.map((e) => e.properties))).toBe(before);
  });
});
