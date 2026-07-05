/**
 * IEEE XES (1849) interchange — import a `.xes` log into the tool's normalised
 * { headers, rows, mapping } table (fed to the same buildEventLog pipeline as
 * CSV), and export a mining run back to XES for round-trips with ProM / Celonis /
 * Disco / Apromore / Signavio Process Intelligence.
 *
 * XES has no "state" concept, so state is left UNMAPPED on import — the miner's
 * Activity→State table (Change A) then supplies the lifecycle. Export is
 * variant-level: traces are reconstructed from the compressed variants (raw
 * events aren't stored) with synthetic, monotonic timestamps.
 *
 * Dependency-free: XES is machine-generated and regular, so a tolerant scanner
 * suffices (no XML library in the repo). Pure.
 */
import type { LogMapping, Variant, MiningStats } from "../types";

// ── shared ───────────────────────────────────────────────────────────────────

const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const ATTR = /<(?:string|date|int|float|boolean|id)\s+key="([^"]*)"\s+value="([^"]*)"\s*\/?>/g;

// Strip only the STANDARD XES extension prefixes, so a custom governance key like
// "control:id" keeps its "control" signal (a bare "id" would lose it).
const STD_PREFIX = /^(?:concept|time|org|lifecycle|cost|identity|semantic):/;
const stripStdPrefix = (k: string) => (STD_PREFIX.test(k) ? k.replace(/^[^:]*:/, "") : k);

/** All `key → value` attribute nodes in an XES fragment (unescaped). */
function parseAttrs(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(fragment))) out[unescapeXml(m[1])] = unescapeXml(m[2]);
  return out;
}

export interface ParsedLog {
  headers: string[];
  rows: string[][];
  mapping: Partial<LogMapping>;
}

// ── import ────────────────────────────────────────────────────────────────────

/** Parse XES XML → a normalised table + a best-guess mapping. */
export function parseXes(xml: string): ParsedLog {
  const text = (xml ?? "").replace(/^﻿/, "");
  // Fixed, well-known columns first; extra event keys appended in first-seen order.
  const FIXED = ["case", "activity", "timestamp", "resource", "lifecycle"] as const;
  const extraKeys: string[] = [];
  const seenExtra = new Set<string>();
  const records: Record<string, string>[] = [];

  const traceRe = /<trace\b[^>]*>([\s\S]*?)<\/trace>/g;
  let tm: RegExpExecArray | null;
  while ((tm = traceRe.exec(text))) {
    const inner = tm[1];
    // Trace-level attrs = attrs NOT inside an <event>.
    const traceOnly = inner.replace(/<event\b[^>]*>[\s\S]*?<\/event>/g, "");
    const tAttrs = parseAttrs(traceOnly);
    const caseId = tAttrs["concept:name"] ?? "";

    const eventRe = /<event\b[^>]*>([\s\S]*?)<\/event>/g;
    let em: RegExpExecArray | null;
    while ((em = eventRe.exec(inner))) {
      const a = parseAttrs(em[1]);
      const rec: Record<string, string> = {
        case: caseId,
        activity: a["concept:name"] ?? "",
        timestamp: a["time:timestamp"] ?? "",
        resource: a["org:resource"] ?? a["org:role"] ?? "",
        lifecycle: a["lifecycle:transition"] ?? "",
      };
      // Any other keys become their own columns (control/risk/policy/etc.).
      for (const [k, v] of Object.entries(a)) {
        if (k === "concept:name" || k === "time:timestamp" || k === "org:resource" || k === "org:role" || k === "lifecycle:transition") continue;
        const col = stripStdPrefix(k);
        rec[col] = v;
        if (!seenExtra.has(col)) { seenExtra.add(col); extraKeys.push(col); }
      }
      records.push(rec);
    }
  }

  const headers = [...FIXED, ...extraKeys];
  const rows = records.map((r) => headers.map((h) => r[h] ?? ""));
  const has = (h: string) => rows.some((r) => r[headers.indexOf(h)]?.trim());
  const findExtra = (re: RegExp) => extraKeys.find((k) => re.test(k.toLowerCase()));

  const mapping: Partial<LogMapping> = { caseId: "case", activity: "activity", timestamp: "timestamp" };
  if (has("resource")) mapping.resource = "resource";
  const ctl = findExtra(/control|rcm/), rsk = findExtra(/risk/), pol = findExtra(/policy/);
  if (ctl) mapping.controlId = ctl;
  if (rsk) mapping.riskId = rsk;
  if (pol) mapping.policyId = pol;
  // No state column: buildEventLog / the Activity→State table completes it.
  return { headers, rows, mapping };
}

// ── export ────────────────────────────────────────────────────────────────────

const MS_PER_HOUR = 3_600_000;

export interface XesExportInput {
  name: string;
  variants: Variant[];
  stats?: MiningStats | null;
  /** Cap on total traces emitted (variant counts are expanded). */
  maxTraces?: number;
}

/** Serialise a mining run's variants to XES. Variant-level fidelity: one trace per
 *  case (expanded from the variant count, capped), synthetic monotonic timestamps
 *  based on the run's observed window. State is emitted as a `custom:state`
 *  attribute when it differs from the activity name. */
export function buildXes(input: XesExportInput): string {
  const cap = input.maxTraces ?? 5000;
  const base = input.stats?.from ?? 0;
  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<log xes.version="1.0" xes.features="nested-attributes" xmlns="http://www.xes-standard.org/">');
  lines.push('  <extension name="Concept" prefix="concept" uri="http://www.xes-standard.org/concept.xesext"/>');
  lines.push('  <extension name="Time" prefix="time" uri="http://www.xes-standard.org/time.xesext"/>');
  lines.push('  <extension name="Lifecycle" prefix="lifecycle" uri="http://www.xes-standard.org/lifecycle.xesext"/>');
  lines.push('  <extension name="Organizational" prefix="org" uri="http://www.xes-standard.org/org.xesext"/>');
  lines.push(`  <string key="concept:name" value="${escapeXml(input.name || "DiagramatixMINER log")}"/>`);

  let traceNo = 0;
  outer: for (const v of input.variants) {
    for (let c = 0; c < v.count; c++) {
      if (traceNo >= cap) break outer;
      const caseId = `case-${traceNo + 1}`;
      const traceStart = base + traceNo * MS_PER_HOUR;
      lines.push("  <trace>");
      lines.push(`    <string key="concept:name" value="${escapeXml(caseId)}"/>`);
      for (let i = 0; i < v.events.length; i++) {
        const act = v.events[i] ?? "";
        const st = v.states[i] ?? "";
        const ts = new Date(traceStart + i * 60_000).toISOString();
        lines.push("    <event>");
        lines.push(`      <string key="concept:name" value="${escapeXml(act)}"/>`);
        lines.push(`      <date key="time:timestamp" value="${ts}"/>`);
        lines.push('      <string key="lifecycle:transition" value="complete"/>');
        if (st && st !== act) lines.push(`      <string key="custom:state" value="${escapeXml(st)}"/>`);
        lines.push("    </event>");
      }
      lines.push("  </trace>");
      traceNo++;
    }
  }
  lines.push("</log>");
  return lines.join("\n");
}
