/**
 * Event-log ingestion: a dependency-free CSV parser + column-role mapping +
 * normalisation into per-entity traces and compressed VARIANTS. Pure; unit-tested.
 * (No CSV library exists in the repo, so this is net-new but deliberately small.)
 */
import type { LogMapping, LogEvent, CaseTrace, Variant, MiningStats, EventLog } from "./types";
import { activityToState } from "./stateNaming";

// ── CSV ────────────────────────────────────────────────────────────────────

/** Guess the delimiter from the first line (comma / semicolon / tab). */
function detectDelimiter(text: string): string {
  const nl = text.indexOf("\n");
  const first = nl >= 0 ? text.slice(0, nl) : text;
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, first.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Parse delimited text into rows of fields, honouring quotes (embedded
 *  delimiters, escaped `""`, and newlines inside quotes) and CRLF/CR/LF. */
function parseDelimited(text: string, delim: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const endRow = () => { row.push(field); rows.push(row); row = []; field = ""; };
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delim) { row.push(field); field = ""; i++; continue; }
    if (c === "\n") { endRow(); i++; continue; }
    if (c === "\r") { if (text[i + 1] === "\n") { i++; continue; } endRow(); i++; continue; }
    field += c; i++;
  }
  if (field !== "" || row.length > 0) endRow();
  return rows;
}

/** Parse CSV text → { headers, rows } (blank lines dropped, BOM stripped). */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const clean = (text ?? "").replace(/^﻿/, "");
  const records = parseDelimited(clean, detectDelimiter(clean));
  if (records.length === 0) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = records.slice(1).filter((r) => r.some((c) => c.trim() !== ""));
  return { headers, rows };
}

// ── Mapping ──────────────────────────────────────────────────────────────────

/** Auto-guess the column→role mapping from header names. */
export function guessMapping(headers: string[]): Partial<LogMapping> {
  const find = (pats: RegExp[]) => headers.find((h) => pats.some((p) => p.test(h.toLowerCase())));
  const out: Partial<LogMapping> = {};
  const caseId = find([/case/, /instance/, /^id$/, /_id$/, /\bid\b/, /invoice/, /employee/, /order/, /ticket/, /registrant/, /entity/]);
  const activity = find([/activity/, /event/, /action/, /task/, /\bstep\b/]);
  const timestamp = find([/timestamp/, /\btime\b/, /\bdate\b/, /datetime/, /when/, /occurred/]);
  const state = find([/state/, /status/, /stage/, /phase/]);
  const resource = find([/resource/, /\buser\b/, /agent/, /owner/, /perform/, /\bwho\b/, /assign/, /\bby\b/]);
  const entityType = find([/entity.?type/, /object.?type/, /\btype\b/]);
  const controlId = find([/control.?id/, /\bcontrol\b/, /\brcm\b/]);
  const riskId = find([/risk.?id/, /\brisk\b/]);
  const policyId = find([/policy.?id/, /\bpolicy\b/]);
  if (caseId) out.caseId = caseId;
  if (activity) out.activity = activity;
  if (timestamp) out.timestamp = timestamp;
  if (state) out.state = state;
  if (resource) out.resource = resource;
  if (entityType) out.entityType = entityType;
  if (controlId) out.controlId = controlId;
  if (riskId) out.riskId = riskId;
  if (policyId) out.policyId = policyId;
  return out;
}

/** Distinct activity names (in first-seen order) — seeds the Activity→State table
 *  the console shows when no state column is mapped. */
export function distinctActivities(headers: string[], rows: string[][], activityCol?: string): string[] {
  const ai = activityCol ? headers.indexOf(activityCol) : -1;
  if (ai < 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) { const a = (r[ai] ?? "").trim(); if (a && !seen.has(a)) { seen.add(a); out.push(a); } }
  return out;
}

// Excel (1900 date system) serial-date range we accept: ~1990-01-01 .. 2100-01-01.
// Narrow enough that id-like numbers aren't mistaken for dates. Unix epoch = serial
// 25569 (days from Excel's 1899-12-30 base to 1970-01-01, which absorbs the 1900
// leap-year bug for modern dates).
const EXCEL_SERIAL_MIN = 32874, EXCEL_SERIAL_MAX = 73051;

/** An Excel serial date (integer days since 1899-12-30, optional time fraction) →
 *  epoch ms, or null if outside the plausible modern range. */
export function excelSerialToMs(n: number): number | null {
  if (!Number.isFinite(n) || n < EXCEL_SERIAL_MIN || n > EXCEL_SERIAL_MAX) return null;
  return Math.round((n - 25569) * 86_400_000);
}

/** epoch (s or ms), an Excel serial date, or an ISO/parseable date string → epoch
 *  ms, else null. */
export function parseTimestamp(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  if (/^\d{13}$/.test(s)) return Number(s);
  if (/^\d{10}$/.test(s)) return Number(s) * 1000;
  // Excel serial date — a CSV exported from Excel whose date cell wasn't formatted
  // as text comes through as a bare number (e.g. 45658 or 45658.375).
  if (/^\d+(\.\d+)?$/.test(s)) { const ms = excelSerialToMs(Number(s)); if (ms !== null) return ms; }
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

// ── Normalise → traces → variants ────────────────────────────────────────────

/** Build the normalised + compressed event log from parsed rows + a mapping.
 *  Rows missing a case id or a valid timestamp are dropped (counted in stats). */
export function buildEventLog(headers: string[], rows: string[][], mapping: LogMapping): EventLog {
  const idx = (col: string | undefined) => (col ? headers.indexOf(col) : -1);
  const ci = idx(mapping.caseId), ai = idx(mapping.activity), ti = idx(mapping.timestamp), si = idx(mapping.state), ri = idx(mapping.resource);
  const cti = idx(mapping.controlId), rki = idx(mapping.riskId), pli = idx(mapping.policyId);
  // No state column? Derive each event's state from the Activity→State table,
  // else from the activity's PAST PARTICIPLE ("Ship" → "Shipped") so an inferred
  // state reads as a condition, not a command. State names are Capitalised
  // (S1.06) so a discovered SM reads consistently and lines up with a
  // conventionally-capitalised reference — e.g. an OCEL status "placed" → "Placed".
  const stateMap = mapping.activityState ?? {};
  const cap = (s: string): string => { const t = (s ?? "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; };
  const stateFor = (activity: string, raw: string): string =>
    cap(si >= 0 ? raw : (stateMap[activity] ?? activityToState(activity)));

  const events: LogEvent[] = [];
  let unmapped = 0;
  for (const r of rows) {
    const caseId = (r[ci] ?? "").trim();
    const timestamp = parseTimestamp(r[ti] ?? "");
    if (!caseId || timestamp === null) { unmapped++; continue; }
    const activity = (r[ai] ?? "").trim();
    const resource = ri >= 0 ? (r[ri] ?? "").trim() : "";
    const controlId = cti >= 0 ? (r[cti] ?? "").trim() : "";
    const riskId = rki >= 0 ? (r[rki] ?? "").trim() : "";
    const policyId = pli >= 0 ? (r[pli] ?? "").trim() : "";
    events.push({
      caseId,
      activity,
      state: stateFor(activity, r[si] ?? ""),
      timestamp,
      ...(resource ? { resource } : {}),
      ...(controlId ? { controlId } : {}),
      ...(riskId ? { riskId } : {}),
      ...(policyId ? { policyId } : {}),
    });
  }

  const byCase = new Map<string, LogEvent[]>();
  for (const e of events) (byCase.get(e.caseId) ?? byCase.set(e.caseId, []).get(e.caseId)!).push(e);
  const traces: CaseTrace[] = [];
  for (const [caseId, evs] of byCase) {
    evs.sort((a, b) => a.timestamp - b.timestamp); // stable → ties keep input order
    traces.push({ caseId, events: evs });
  }

  const variantMap = new Map<string, Variant>();
  for (const t of traces) {
    const states = t.events.map((e) => e.state);
    const acts = t.events.map((e) => e.activity);
    const key = JSON.stringify([states, acts]);
    const v = variantMap.get(key);
    if (v) v.count++; else variantMap.set(key, { states, events: acts, count: 1 });
  }
  const variants = [...variantMap.values()].sort((a, b) => b.count - a.count);

  const times = events.map((e) => e.timestamp);
  const stats: MiningStats = {
    cases: traces.length,
    events: events.length,
    activities: [...new Set(events.map((e) => e.activity).filter(Boolean))].sort(),
    states: [...new Set(events.map((e) => e.state).filter(Boolean))].sort(),
    variants: variants.length,
    from: times.length ? Math.min(...times) : undefined,
    to: times.length ? Math.max(...times) : undefined,
    ...(unmapped ? { unmappedRows: unmapped } : {}),
  };

  return { events, traces, variants, stats };
}
