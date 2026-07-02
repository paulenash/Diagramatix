/**
 * BPSim exporter — emit a `<bpsim:BPSimData>` block from the neutral
 * BpsimScenario shape. Designed to round-trip losslessly with parseBpsimScenarios
 * (same parameter categories, ISO durations for time values), and to drop
 * straight into a BPMN document's `<extensionElements>`.
 *
 * Time-valued `fixed` distributions are emitted as DurationParameter (ISO-8601,
 * the BPSim convention); non-time fixed values (property inits) stay
 * NumericParameter. Distribution kinds map to their BPSim elements.
 */

import type { SimDist, ClockUnit } from "../types";
import { unitToIso } from "../duration";
import { serializeWorkCalendar } from "../calendar";
import type { BpsimScenario, BpsimElementParams } from "./types";

const NS = "bpsim";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

/** A distribution as its BPSim element. `time` → a fixed value becomes an
 *  ISO DurationParameter; otherwise a NumericParameter. */
function distXml(d: SimDist, time: boolean, unit: ClockUnit): string {
  switch (d.kind) {
    case "normal":
      return `<${NS}:TruncatedNormalDistribution mean="${d.mean}" standardDeviation="${d.sd}" min="0" max="1000000"/>`;
    case "triangular":
      return `<${NS}:TriangularDistribution min="${d.min}" mode="${d.mode}" max="${d.max}"/>`;
    case "uniform":
      return `<${NS}:UniformDistribution min="${d.min}" max="${d.max}"/>`;
    case "exponential":
      return `<${NS}:NegativeExponentialDistribution mean="${d.mean}"/>`;
    case "fixed":
      return time
        ? `<${NS}:DurationParameter value="${unitToIso(d.value, unit)}"/>`
        : `<${NS}:NumericParameter value="${d.value}"/>`;
  }
}

function elementXml(ref: string, p: BpsimElementParams, unit: ClockUnit, indent: string): string {
  const L: string[] = [];
  const time: string[] = [];
  if (p.processingTime) time.push(`<${NS}:ProcessingTime>${distXml(p.processingTime, true, unit)}</${NS}:ProcessingTime>`);
  if (p.waitTime) time.push(`<${NS}:WaitTime>${distXml(p.waitTime, true, unit)}</${NS}:WaitTime>`);
  if (p.setupTime) time.push(`<${NS}:SetupTime>${distXml(p.setupTime, true, unit)}</${NS}:SetupTime>`);
  if (time.length) L.push(`<${NS}:TimeParameters>${time.join("")}</${NS}:TimeParameters>`);

  const ctrl: string[] = [];
  if (p.interArrival) ctrl.push(`<${NS}:InterTriggerTimer>${distXml(p.interArrival, true, unit)}</${NS}:InterTriggerTimer>`);
  if (p.probability !== undefined) ctrl.push(`<${NS}:Probability><${NS}:FloatingParameter value="${p.probability}"/></${NS}:Probability>`);
  if (p.condition) ctrl.push(`<${NS}:Condition><${NS}:ExpressionParameter value="${esc(p.condition)}"/></${NS}:Condition>`);
  if (ctrl.length) L.push(`<${NS}:ControlParameters>${ctrl.join("")}</${NS}:ControlParameters>`);

  const res: string[] = [];
  if (p.quantity !== undefined) res.push(`<${NS}:Quantity><${NS}:NumericParameter value="${p.quantity}"/></${NS}:Quantity>`);
  if (p.selection) res.push(`<${NS}:Selection><${NS}:ExpressionParameter value="${esc(p.selection)}"/></${NS}:Selection>`);
  if (res.length) L.push(`<${NS}:ResourceParameters>${res.join("")}</${NS}:ResourceParameters>`);

  if (p.assignments?.length) {
    const props = p.assignments.map((a) => {
      const typeAttr = a.type ? ` type="${esc(a.type)}"` : "";
      const body = a.expr ? `<${NS}:ExpressionParameter value="${esc(a.expr)}"/>` : a.init ? distXml(a.init, false, unit) : "";
      return `<${NS}:Property name="${esc(a.property)}"${typeAttr}>${body}</${NS}:Property>`;
    }).join("");
    L.push(`<${NS}:PropertyParameters>${props}</${NS}:PropertyParameters>`);
  }

  const openAttrs = `elementRef="${esc(ref)}"${p.calendarRef ? ` calendarRef="${esc(p.calendarRef)}"` : ""}`;
  if (L.length === 0) return `${indent}<${NS}:ElementParameters ${openAttrs}/>`;
  return `${indent}<${NS}:ElementParameters ${openAttrs}>${L.map((x) => `\n${indent}  ${x}`).join("")}\n${indent}</${NS}:ElementParameters>`;
}

/** Serialise scenarios to a `<bpsim:BPSimData>` block. `unit` is the ClockUnit
 *  the numbers are in (drives ISO-8601 duration emission). */
export function buildBpsimData(scenarios: BpsimScenario[], unit: ClockUnit = "minute"): string {
  const out: string[] = [`<${NS}:BPSimData xmlns:${NS}="http://www.bpsim.org/schemas/1.0">`];
  for (const sc of scenarios) {
    const attrs = [
      sc.id ? ` id="${esc(sc.id)}"` : "",
      sc.name ? ` name="${esc(sc.name)}"` : "",
      sc.author ? ` author="${esc(sc.author)}"` : "",
    ].join("");
    out.push(`  <${NS}:Scenario${attrs}>`);

    if (sc.replication !== undefined || sc.horizon !== undefined || sc.warmUp !== undefined) {
      const repAttr = sc.replication !== undefined ? ` replication="${sc.replication}"` : "";
      out.push(`    <${NS}:ScenarioParameters${repAttr}>`);
      if (sc.horizon !== undefined) out.push(`      <${NS}:Duration><${NS}:DurationParameter value="${unitToIso(sc.horizon, unit)}"/></${NS}:Duration>`);
      if (sc.warmUp !== undefined) out.push(`      <${NS}:Warmup><${NS}:DurationParameter value="${unitToIso(sc.warmUp, unit)}"/></${NS}:Warmup>`);
      out.push(`    </${NS}:ScenarioParameters>`);
    }

    // Scenario-level working calendars (referenced by a source's calendarRef).
    for (const c of sc.calendars ?? []) {
      const nameAttr = c.name ? ` name="${esc(c.name)}"` : "";
      out.push(`    <${NS}:Calendar id="${esc(c.id)}"${nameAttr}>${esc(serializeWorkCalendar(c.pattern))}</${NS}:Calendar>`);
    }

    for (const [ref, p] of Object.entries(sc.elements)) {
      out.push(elementXml(ref, p, unit, "    "));
    }
    out.push(`  </${NS}:Scenario>`);
  }
  out.push(`</${NS}:BPSimData>`);
  return out.join("\n");
}
