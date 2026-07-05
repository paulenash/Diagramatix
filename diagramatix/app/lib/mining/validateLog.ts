/**
 * Pre-import validation of an event log against a chosen column mapping — runs
 * client-side off the already-parsed rows so the user can confirm the mapping is
 * right BEFORE ingesting (and knows what will be discarded). Pure + unit-tested.
 *
 * Advisory only: nothing here blocks an import. It surfaces what buildEventLog
 * would otherwise do silently (drop rows with no case id / bad timestamp) plus a
 * few soft "does this mapping look right?" heuristics.
 */
import { parseTimestamp, excelSerialToMs } from "./parseEventLog";
import type { LogMapping } from "./types";

export type TimestampFormat = "ISO / date" | "epoch seconds" | "epoch milliseconds" | "Excel serial date" | "unrecognised" | "—";

export interface LogValidation {
  total: number;             // data rows
  usable: number;            // rows with a case id AND a parseable timestamp
  dropped: number;           // total - usable
  timestampFormat: TimestampFormat;
  from?: number;             // epoch ms of earliest usable event
  to?: number;               // epoch ms of latest usable event
  distinctCases: number;
  distinctActivities: number;
  distinctStates: number;
  singleEventCases: number;
  /** Up to 3 distinct sample values per mapped role (for eyeballing the mapping). */
  samples: Partial<Record<keyof LogMapping, string[]>>;
  warnings: { level: "warn" | "info"; message: string }[];
}

// Column-valued roles only (excludes activityState, which is a config map).
type ColKey = Exclude<keyof LogMapping, "activityState">;
const ROLE_KEYS: ColKey[] = ["caseId", "activity", "timestamp", "state", "resource", "entityType", "controlId", "riskId", "policyId"];

function classifyTs(raw: string): TimestampFormat {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  if (/^\d{13}$/.test(s)) return "epoch milliseconds";
  if (/^\d{10}$/.test(s)) return "epoch seconds";
  if (/^\d+(\.\d+)?$/.test(s) && excelSerialToMs(Number(s)) !== null) return "Excel serial date";
  return parseTimestamp(s) !== null ? "ISO / date" : "unrecognised";
}

export function validateEventLogMapping(
  headers: string[],
  rows: string[][],
  mapping: Partial<LogMapping>,
): LogValidation {
  const idx = (col?: string) => (col ? headers.indexOf(col) : -1);
  const ci = idx(mapping.caseId), ai = idx(mapping.activity), ti = idx(mapping.timestamp), si = idx(mapping.state);

  let usable = 0;
  let from: number | undefined, to: number | undefined;
  let tsFormat: TimestampFormat = "—";
  const caseCounts = new Map<string, number>();
  const activities = new Set<string>();
  const states = new Set<string>();

  // Distinct-sample collectors per mapped role.
  const samples: Partial<Record<keyof LogMapping, string[]>> = {};
  const sampleSeen: Partial<Record<keyof LogMapping, Set<string>>> = {};
  for (const k of ROLE_KEYS) if (idx(mapping[k]) >= 0) { samples[k] = []; sampleSeen[k] = new Set(); }

  for (const r of rows) {
    // sample values per role
    for (const k of ROLE_KEYS) {
      const c = idx(mapping[k]);
      if (c < 0) continue;
      const v = (r[c] ?? "").trim();
      const arr = samples[k]!, seen = sampleSeen[k]!;
      if (v && arr.length < 3 && !seen.has(v)) { seen.add(v); arr.push(v); }
    }

    const caseId = ci >= 0 ? (r[ci] ?? "").trim() : "";
    const tsRaw = ti >= 0 ? (r[ti] ?? "").trim() : "";
    if (tsFormat === "—" && tsRaw) tsFormat = classifyTs(tsRaw);
    const ts = parseTimestamp(tsRaw);
    if (!caseId || ts === null) continue;   // buildEventLog would drop this row

    usable++;
    caseCounts.set(caseId, (caseCounts.get(caseId) ?? 0) + 1);
    if (ai >= 0) { const a = (r[ai] ?? "").trim(); if (a) activities.add(a); }
    if (si >= 0) { const s = (r[si] ?? "").trim(); if (s) states.add(s); }
    if (from === undefined || ts < from) from = ts;
    if (to === undefined || ts > to) to = ts;
  }

  const total = rows.length;
  const dropped = total - usable;
  const distinctCases = caseCounts.size;
  let singleEventCases = 0;
  for (const n of caseCounts.values()) if (n === 1) singleEventCases++;

  const warnings: LogValidation["warnings"] = [];
  if (total > 0 && dropped / total > 0.1) {
    warnings.push({ level: "warn", message: `${dropped.toLocaleString()} of ${total.toLocaleString()} rows (${Math.round((dropped / total) * 100)}%) would be discarded — check the timestamp and case-id columns.` });
  }
  if (tsFormat === "unrecognised") {
    warnings.push({ level: "warn", message: "The timestamp column doesn't look like a date or epoch value — those rows will be dropped." });
  }
  if (distinctCases === 1) {
    warnings.push({ level: "warn", message: "The case-id column has only one distinct value — that's usually the wrong column." });
  }
  if (si >= 0 && usable > 0 && states.size > 40) {
    warnings.push({ level: "warn", message: `The state column has ${states.size.toLocaleString()} distinct values — that's a lot for a lifecycle. Is this really the entity's state, or a free-text/id field?` });
  }
  if (distinctCases > 0 && singleEventCases / distinctCases > 0.3) {
    warnings.push({ level: "warn", message: `${singleEventCases.toLocaleString()} of ${distinctCases.toLocaleString()} cases have only one event — the log may be truncated or the case id may be wrong.` });
  }

  return {
    total, usable, dropped,
    timestampFormat: tsFormat,
    from, to,
    distinctCases,
    distinctActivities: activities.size,
    distinctStates: states.size,
    singleEventCases,
    samples,
    warnings,
  };
}
