/**
 * BPSim importer — extract `<bpsim:Scenario>` parameter sets from a BPMN 2.0
 * document's `<extensionElements>` (or a standalone .bpsim file). Regex-based +
 * namespace-prefix-agnostic, mirroring app/lib/diagram/bpmn/importBpmnXml.ts —
 * no XML-parser dependency.
 *
 * Coverage (verified against the official examples in new features/BPsim/
 * Examples/): ScenarioParameters (replication, Duration, Warmup); TimeParameters
 * (ProcessingTime/WaitTime/SetupTime); ControlParameters (InterTriggerTimer/
 * Probability/Condition; TriggerCount + result requests are outputs → skipped);
 * ResourceParameters (Quantity/Selection); PropertyParameters (Property with an
 * init distribution OR an ExpressionParameter assignment). Distributions:
 * TruncatedNormal/Normal → normal, Triangular → triangular, Uniform → uniform,
 * DurationParameter → fixed (ISO→unit), Numeric/Floating → fixed.
 */

import type { SimDist, ClockUnit } from "../types";
import { isoToUnit } from "../duration";
import { parseWorkCalendar } from "../calendar";
import type { BpsimScenario, BpsimElementParams, BpsimAssignment, BpsimCalendar } from "./types";

const px = "(?:\\w+:)?"; // optional namespace prefix

/** Decode the XML entities BPSim values may carry (expressions use ' and >). */
function decode(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

/** First attribute value on an open tag. Captures by the OPENING quote so a
 *  value may itself contain the other quote char (expressions hold both ' and
 *  >, which are legal inside a double-quoted attribute). */
function attr(openTag: string, name: string): string | undefined {
  const m = openTag.match(new RegExp(`\\s${name}=("([^"]*)"|'([^']*)')`));
  if (!m) return undefined;
  return decode(m[2] !== undefined ? m[2] : m[3] ?? "");
}

/** All `<x:Tag ...>inner</x:Tag>` blocks (prefix-agnostic). Captures the open-
 *  tag attributes and the inner content. Same-named tags here never nest. */
function blocks(xml: string, local: string): { open: string; inner: string }[] {
  const re = new RegExp(`<${px}${local}\\b([^>]*)>([\\s\\S]*?)</${px}${local}>`, "g");
  const out: { open: string; inner: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push({ open: m[1], inner: m[2] });
  return out;
}

/** A single self-closing or empty element's open-tag attributes, if present. */
function firstTagAttrs(xml: string, local: string): string | undefined {
  const m = xml.match(new RegExp(`<${px}${local}\\b([^>]*?)/?>`));
  return m ? m[1] : undefined;
}

/** Parse the distribution / parameter inside a time-or-property container. */
function parseDist(inner: string, unit: ClockUnit): SimDist | undefined {
  let t = firstTagAttrs(inner, "TruncatedNormalDistribution") ?? firstTagAttrs(inner, "NormalDistribution");
  if (t) {
    const mean = num(attr(t, "mean")), sd = num(attr(t, "standardDeviation"));
    if (mean !== undefined && sd !== undefined) return { kind: "normal", mean, sd };
  }
  t = firstTagAttrs(inner, "TriangularDistribution");
  if (t) {
    const min = num(attr(t, "min")), mode = num(attr(t, "mode")), max = num(attr(t, "max"));
    if (min !== undefined && mode !== undefined && max !== undefined) return { kind: "triangular", min, mode, max };
  }
  t = firstTagAttrs(inner, "UniformDistribution");
  if (t) {
    const min = num(attr(t, "min")), max = num(attr(t, "max"));
    if (min !== undefined && max !== undefined) return { kind: "uniform", min, max };
  }
  t = firstTagAttrs(inner, "NegativeExponentialDistribution") ?? firstTagAttrs(inner, "ExponentialDistribution");
  if (t) {
    const mean = num(attr(t, "mean"));
    if (mean !== undefined) return { kind: "exponential", mean };
  }
  // DurationParameter (ISO-8601) → a fixed value in the chosen unit.
  t = firstTagAttrs(inner, "DurationParameter");
  if (t) {
    const v = attr(t, "value");
    if (v) { try { return { kind: "fixed", value: isoToUnit(v, unit) }; } catch { /* malformed */ } }
  }
  // Numeric / Floating constant → fixed.
  t = firstTagAttrs(inner, "NumericParameter") ?? firstTagAttrs(inner, "FloatingParameter");
  if (t) {
    const v = num(attr(t, "value"));
    if (v !== undefined) return { kind: "fixed", value: v };
  }
  return undefined;
}

function num(s: string | undefined): number | undefined {
  if (s === undefined) return undefined;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

/** Highest NumericParameter value (the staffed level, ignoring the 0 default /
 *  per-calendar variants), for ResourceParameters/Quantity. */
function maxNumeric(inner: string): number | undefined {
  let best: number | undefined;
  const re = new RegExp(`<${px}NumericParameter\\b([^>]*?)/?>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    const v = num(attr(m[1], "value"));
    if (v !== undefined && (best === undefined || v > best)) best = v;
  }
  return best;
}

/** Pull the `value` of an ExpressionParameter. Matched directly (not via the
 *  generic open-tag scan) because the value commonly contains `>` — which a
 *  `[^>]*` tag-boundary scan would choke on. */
function exprValue(inner: string): string | undefined {
  const m = inner.match(new RegExp(`<${px}ExpressionParameter\\b[^>]*?\\svalue=("([^"]*)"|'([^']*)')`));
  if (!m) return undefined;
  return decode(m[2] !== undefined ? m[2] : m[3] ?? "");
}

function parseElementParams(inner: string, unit: ClockUnit): BpsimElementParams {
  const p: BpsimElementParams = {};

  const time = blocks(inner, "TimeParameters")[0]?.inner;
  if (time) {
    const proc = blocks(time, "ProcessingTime")[0]?.inner;
    if (proc) p.processingTime = parseDist(proc, unit);
    const wait = blocks(time, "WaitTime")[0]?.inner;
    if (wait) p.waitTime = parseDist(wait, unit);
    const setup = blocks(time, "SetupTime")[0]?.inner;
    if (setup) p.setupTime = parseDist(setup, unit);
  }

  const ctrl = blocks(inner, "ControlParameters")[0]?.inner;
  if (ctrl) {
    const itt = blocks(ctrl, "InterTriggerTimer")[0]?.inner;
    if (itt) p.interArrival = parseDist(itt, unit);
    const prob = blocks(ctrl, "Probability")[0]?.inner;
    if (prob) { const fp = firstTagAttrs(prob, "FloatingParameter"); const v = fp ? num(attr(fp, "value")) : undefined; if (v !== undefined) p.probability = v; }
    const cond = blocks(ctrl, "Condition")[0]?.inner;
    if (cond) { const e = exprValue(cond); if (e) p.condition = e; }
  }

  const res = blocks(inner, "ResourceParameters")[0]?.inner;
  if (res) {
    const qty = blocks(res, "Quantity")[0]?.inner;
    if (qty) { const q = maxNumeric(qty); if (q !== undefined) p.quantity = q; }
    const sel = blocks(res, "Selection")[0]?.inner;
    if (sel) { const e = exprValue(sel); if (e) p.selection = e; }
  }

  const props = blocks(inner, "PropertyParameters")[0]?.inner;
  if (props) {
    const assignments: BpsimAssignment[] = [];
    for (const prop of blocks(props, "Property")) {
      const name = attr(prop.open, "name");
      if (!name) continue;
      const a: BpsimAssignment = { property: name, type: attr(prop.open, "type") };
      const e = exprValue(prop.inner);
      if (e) a.expr = e; else a.init = parseDist(prop.inner, unit);
      if (a.expr || a.init) assignments.push(a);
    }
    if (assignments.length) p.assignments = assignments;
  }

  return p;
}

/** Parse all BPSim scenarios in a BPMN/BPSim document. `unit` is the target
 *  ClockUnit for converting ISO durations (distribution params are left as the
 *  scenario's own base-unit numbers). Returns [] if the document has no BPSim. */
export function parseBpsimScenarios(xml: string, unit: ClockUnit = "minute"): BpsimScenario[] {
  const out: BpsimScenario[] = [];
  for (const sc of blocks(xml, "Scenario")) {
    const scenario: BpsimScenario = {
      id: attr(sc.open, "id"),
      name: attr(sc.open, "name"),
      author: attr(sc.open, "author"),
      elements: {},
    };
    const sp = blocks(sc.inner, "ScenarioParameters")[0];
    if (sp) {
      const rep = num(attr(sp.open, "replication"));
      if (rep !== undefined) scenario.replication = rep;
      const dur = blocks(sp.inner, "Duration")[0]?.inner;
      const durAttrs = dur ? firstTagAttrs(dur, "DurationParameter") : undefined;
      const durVal = durAttrs ? attr(durAttrs, "value") : undefined;
      if (durVal) { try { scenario.horizon = isoToUnit(durVal, unit); } catch { /* skip */ } }
      const warm = blocks(sp.inner, "Warmup")[0]?.inner;
      const warmAttrs = warm ? firstTagAttrs(warm, "DurationParameter") : undefined;
      const warmVal = warmAttrs ? attr(warmAttrs, "value") : undefined;
      if (warmVal) { try { scenario.warmUp = isoToUnit(warmVal, unit); } catch { /* skip */ } }
    }
    // Scenario-level working calendars (Diagramatix extension).
    const cals: BpsimCalendar[] = [];
    for (const c of blocks(sc.inner, "Calendar")) {
      const id = attr(c.open, "id");
      if (!id) continue;
      cals.push({ id, name: attr(c.open, "name"), pattern: parseWorkCalendar(decode(c.inner)) });
    }
    if (cals.length) scenario.calendars = cals;
    for (const ep of blocks(sc.inner, "ElementParameters")) {
      const ref = attr(ep.open, "elementRef");
      if (!ref) continue;
      const params = parseElementParams(ep.inner, unit);
      const calRef = attr(ep.open, "calendarRef");
      if (calRef) params.calendarRef = calRef;
      scenario.elements[ref] = params;
    }
    out.push(scenario);
  }
  return out;
}
