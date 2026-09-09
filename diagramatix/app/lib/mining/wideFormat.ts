/**
 * Wide → long: turning "one row per case" into the event log the Miner needs.
 *
 * The parser assumes ONE ROW IS ONE EVENT. Most status-history exports are not
 * shaped like that — an ERP or CRM report, or anything a person builds by hand
 * in a spreadsheet, puts the whole lifecycle across a single row:
 *
 *     row id, case name, case id, state1, state1 timestamp, state2, state2 timestamp, …
 *
 * Fed to the long-format parser, such a row produced exactly ONE event and the
 * rest of the row was silently dropped. The import succeeded, every case looked
 * as though it had a single step, and nothing anywhere said otherwise. That is
 * the failure this module exists to remove: not a crash, a confident wrong
 * answer — and one whose wrongness is invisible in every downstream view.
 *
 * Two shapes are recognised, because both are common and they are easy to tell
 * apart:
 *
 *   PAIRED     "Status 1" + "Status 1 Date"  — the CELL holds the state name.
 *   MILESTONE  "Submitted On", "Approved On" — the HEADER is the activity and
 *              the cell is just the timestamp.
 *
 * Output is ordinary long format, so everything downstream — mapping, guessing,
 * validation, buildEventLog — is untouched.
 *
 * Pure: no DB, no React, no I/O. Runs client-side before the file is ever sent.
 */

import { parseTimestamp } from "./parseEventLog";

/** A (state, timestamp) column pair, by header name. */
export interface WidePair { state: string; timestamp: string }

export interface WideSpec {
  /** Header holding the case identifier. */
  caseId: string;
  /** Paired columns: the cell of `state` names the state, `timestamp` dates it. */
  pairs: WidePair[];
  /** Timestamp-only columns whose HEADER is the activity ("Approved On"). */
  milestones: string[];
  /** Columns copied unchanged onto every event of the case (region, value…). */
  carry: string[];
}

export interface UnpivotResult {
  headers: string[];
  rows: string[][];
  /** Cases in, events out — so the console can say what actually happened. */
  cases: number;
  events: number;
  /**
   * Things that were NOT guessed at. A state with no date, a date with no
   * state, an unparseable timestamp: each is counted and named rather than
   * quietly becoming an event at the epoch or vanishing.
   */
  warnings: string[];
}

/** Suffixes that mark a column as "when this happened". */
const TS_SUFFIX = /[\s_-]*(timestamp|datetime|date|time|on|at)$/i;

const norm = (s: string) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A value that is recognisably a DATE, for detection purposes only.
 *
 * Stricter than `parseTimestamp`, deliberately. That function is generous
 * because by the time it runs the user has already said "this column is the
 * timestamp" — so `Date.parse("1")` yielding the year 2001 is a helpful
 * kindness. Here nobody has said anything yet, and that same generosity makes a
 * column of row numbers look exactly like a column of dates. The first version
 * of this detector duly restructured a log around its "Row ID".
 *
 * So a bare short integer is not evidence. An epoch, an Excel serial, or
 * something carrying date punctuation that actually parses, is.
 */
const DATE_SHAPES = [
  /^\d{4}-\d{1,2}-\d{1,2}([T ]|$)/,             // 2026-02-01, ISO
  /^\d{1,4}\/\d{1,2}\/\d{1,4}([T ]|$)/,         // 01/02/2026 or 2026/02/01
  /^\d{1,2}\.\d{1,2}\.\d{2,4}([T ]|$)/,         // 01.02.2026
  /^\d{1,2}\s+[A-Za-z]{3,}\s+\d{2,4}\b/,        // 1 February 2026
  /^[A-Za-z]{3,}\s+\d{1,2},?\s+\d{2,4}\b/,      // February 1, 2026
];

function isDateValue(v: string): boolean {
  if (/^\d{13}$/.test(v) || /^\d{10}$/.test(v)) return true;                 // epoch ms / s
  if (/^\d{5}(\.\d+)?$/.test(v) && parseTimestamp(v) !== null) return true;  // Excel serial
  // Explicit SHAPES, not Date.parse. V8's legacy fallback reads "C-1" as a real
  // date in 2001 — and "1" as one too — so anything that defers to it will
  // eventually decide a column of case ids or row numbers is a lifecycle. This
  // detector restructures somebody's log, so it has to be certain, not willing.
  if (!DATE_SHAPES.some((re) => re.test(v))) return false;
  return parseTimestamp(v) !== null;             // shape AND a real date (not 2026-13-45)
}

/**
 * Does this column hold dates?
 *
 * The DATA decides — a header can be called anything, and a column named
 * "Stage 2 Date" full of "in progress" is not a date column. But the header is
 * allowed to lower the amount of evidence required, because later lifecycle
 * columns are legitimately sparse: in any real export the last state is reached
 * by a minority of cases, so demanding many samples would miss exactly the
 * columns furthest along the process.
 */
function looksLikeTimestamps(headers: string[], rows: string[][], at: number): boolean {
  let seen = 0, ok = 0;
  for (const r of rows) {
    const v = (r[at] ?? "").trim();
    if (!v) continue;
    seen++;
    if (isDateValue(v)) ok++;
    if (seen >= 25) break;
  }
  if (seen === 0) return false;                    // all blank: proves nothing
  const ratio = ok / seen;
  const named = TS_SUFFIX.test(norm(headers[at])) || /\b(date|time|when)\b/i.test(headers[at]);
  // Named and the data agrees, or unnamed and the data is emphatic on its own.
  return named ? ratio >= 0.8 : seen >= 3 && ratio >= 0.8;
}

/**
 * Guess the wide shape, or return null when the file is not wide.
 *
 * Deliberately conservative. A false positive here silently restructures
 * somebody's log, which is worse than making them press a button — so this
 * needs at least two dated columns before it will claim anything, and the
 * console always shows the result for confirmation rather than acting on it.
 */
export function detectWideSpec(headers: string[], rows: string[][]): WideSpec | null {
  const tsCols = headers.map((_, i) => looksLikeTimestamps(headers, rows, i));
  const dated = tsCols.filter(Boolean).length;
  // One date column is an ordinary long-format log. Two or more, side by side,
  // is the signature of a lifecycle spread across the row.
  if (dated < 2) return null;

  const used = new Set<number>();
  const pairs: WidePair[] = [];
  const milestones: string[] = [];

  // PAIRED first: a dated column whose header extends the one before it.
  for (let i = 1; i < headers.length; i++) {
    if (!tsCols[i] || used.has(i) || used.has(i - 1)) continue;
    const prev = norm(headers[i - 1]);
    const here = norm(headers[i]);
    if (!prev || tsCols[i - 1]) continue;                 // the partner must NOT be dates
    const stripped = here.replace(TS_SUFFIX, "").trim();
    if (stripped === prev) { pairs.push({ state: headers[i - 1], timestamp: headers[i] }); used.add(i).add(i - 1); }
  }

  // MILESTONE: any remaining dated column stands alone, named by its header.
  headers.forEach((h, i) => { if (tsCols[i] && !used.has(i)) { milestones.push(h); used.add(i); } });

  if (pairs.length + milestones.length < 2) return null;

  // The case id, in order of confidence. "Case ID" must win over both "Row ID"
  // (an id, but of the row) and "Case Name" (about the case, but not its key) —
  // and picking either of those silently mis-keys the entire log.
  const free = headers.filter((_, i) => !used.has(i));
  const IS_CASE = /\b(case|instance|record|process)\b/i;
  const IS_KEY = /\b(id|no|num|number|ref|key)\b/i;
  const caseId =
    free.find((h) => IS_CASE.test(h) && IS_KEY.test(h))
    ?? free.find((h) => IS_KEY.test(h))
    ?? free.find((h) => IS_CASE.test(h))
    ?? free[0] ?? headers[0];

  const carry = headers.filter((h, i) => !used.has(i) && h !== caseId);
  return { caseId, pairs, milestones, carry };
}

/** Long-format column names the result uses. Chosen so `guessMapping` finds
 *  them without the user having to intervene. */
export const LONG_HEADERS = { caseId: "Case ID", activity: "Activity", state: "State", timestamp: "Timestamp" } as const;

/**
 * Expand a wide table into one row per event.
 *
 * Events are emitted in column order and then, for each case, sorted by time —
 * because a spreadsheet's column order is a layout decision, not a claim about
 * sequence, and a lifecycle laid out "Closed, Opened, Approved" is still a
 * lifecycle.
 */
export function unpivotWide(headers: string[], rows: string[][], spec: WideSpec): UnpivotResult {
  const at = (name: string) => headers.indexOf(name);
  const ci = at(spec.caseId);
  const out: string[][] = [];
  const outHeaders = [LONG_HEADERS.caseId, LONG_HEADERS.activity, LONG_HEADERS.state, LONG_HEADERS.timestamp, ...spec.carry];

  let noDate = 0, noState = 0, badDate = 0, noCase = 0;
  const cases = new Set<string>();

  for (const r of rows) {
    const caseId = (r[ci] ?? "").trim();
    if (!caseId) { noCase++; continue; }
    const carried = spec.carry.map((c) => (r[at(c)] ?? "").trim());
    const events: { activity: string; state: string; ts: string; ms: number }[] = [];

    for (const p of spec.pairs) {
      const state = (r[at(p.state)] ?? "").trim();
      const ts = (r[at(p.timestamp)] ?? "").trim();
      if (!state && !ts) continue;                       // this case never reached that step
      if (!ts) { noDate++; continue; }                   // a state with no date cannot be placed
      if (!state) { noState++; continue; }                // a date with no state names nothing
      const ms = parseTimestamp(ts);
      if (ms === null) { badDate++; continue; }
      events.push({ activity: state, state, ts, ms });
    }

    for (const m of spec.milestones) {
      const ts = (r[at(m)] ?? "").trim();
      if (!ts) continue;                                  // milestone not reached
      const ms = parseTimestamp(ts);
      if (ms === null) { badDate++; continue; }
      // The header IS the activity; strip the "…On"/"…Date" so the label reads
      // as a step rather than as a column name.
      const label = m.replace(TS_SUFFIX, "").trim() || m;
      events.push({ activity: label, state: label, ts, ms });
    }

    if (events.length === 0) continue;
    cases.add(caseId);
    events.sort((a, b) => a.ms - b.ms);
    for (const e of events) out.push([caseId, e.activity, e.state, e.ts, ...carried]);
  }

  const warnings: string[] = [];
  if (noCase) warnings.push(`${noCase} row${noCase === 1 ? "" : "s"} had no case id and were skipped.`);
  if (noDate) warnings.push(`${noDate} state${noDate === 1 ? " has" : "s have"} no date, so ${noDate === 1 ? "it" : "they"} could not be placed in the sequence.`);
  if (noState) warnings.push(`${noState} date${noState === 1 ? "" : "s"} had no state beside ${noState === 1 ? "it" : "them"} and named no step.`);
  if (badDate) warnings.push(`${badDate} date${badDate === 1 ? "" : "s"} could not be read and ${badDate === 1 ? "was" : "were"} skipped.`);

  return { headers: outHeaders, rows: out, cases: cases.size, events: out.length, warnings };
}

/** One line describing what the expansion will do, for the confirm step. */
export function describeWideSpec(spec: WideSpec): string {
  const parts: string[] = [];
  if (spec.pairs.length) parts.push(`${spec.pairs.length} state/date pair${spec.pairs.length === 1 ? "" : "s"}`);
  if (spec.milestones.length) parts.push(`${spec.milestones.length} milestone column${spec.milestones.length === 1 ? "" : "s"}`);
  return `${parts.join(" and ")}, keyed on “${spec.caseId}”`;
}
