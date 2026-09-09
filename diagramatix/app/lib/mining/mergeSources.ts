/**
 * Several systems, one lifecycle.
 *
 * The CRM holds the front half of a case and the ERP the back half, for the same
 * cases. Neither export is the process; the union is. This merges two or more
 * staged exports into a single long-format table that the ordinary importer then
 * reads with no idea anything unusual happened.
 *
 * Three things make this harder than concatenating files, and each of them fails
 * SILENTLY if ignored — the merge "succeeds" and the numbers are wrong:
 *
 *  1. **Different column names per system.** So each source carries its own
 *     mapping, and the merge emits one canonical set of columns.
 *  2. **Different case ids for the same case.** If the CRM calls it `OPP-123` and
 *     the ERP calls it `SO-456`, merging on the case id produces twice as many
 *     half-length cases — which looks exactly like a successful import. So ids
 *     are unified through a shared business key or an explicit crosswalk, and
 *     when neither is present and nothing overlaps, `verdict` says so and the
 *     caller is expected to refuse.
 *  3. **Nobody owns the gap between two systems.** The days a case spends after
 *     the CRM finishes and before the ERP starts are usually the worst delay in
 *     the process and are invisible in either export alone. `handovers` measures
 *     them here, at the one moment both halves exist in the same place.
 *
 * Pure — no DB, no React, no I/O.
 */

import { parseTimestamp } from "./parseEventLog";
import type { LogMapping } from "./types";

/** The nine column roles, in the order the merged table lays them out. */
const ROLE_ORDER = ["caseId", "activity", "timestamp", "state", "resource", "entityType", "controlId", "riskId", "policyId"] as const;
type Role = (typeof ROLE_ORDER)[number];

/** The canonical header each role gets in the merged table. */
const ROLE_HEADER: Record<Role, string> = {
  caseId: "Case", activity: "Activity", timestamp: "Timestamp", state: "State",
  resource: "Resource", entityType: "Entity type", controlId: "Control ID",
  riskId: "Risk ID", policyId: "Policy ID",
};

/** Which system reported the event. Added to every merged row. */
export const SOURCE_COLUMN = "Source system";

/** One staged export, with its own column names and its own mapping. */
export interface MergeSource {
  /** Stable key — the file name will do. */
  id: string;
  /** What gets written into {@link SOURCE_COLUMN}. The system's name. */
  name: string;
  headers: string[];
  rows: string[][];
  mapping: Partial<LogMapping>;
  /**
   * A column in THIS file holding a business key shared with another file — the
   * order reference both systems quote, say. Two sources that agree on a key
   * value are talking about the same case, whatever they each call it.
   */
  linkColumn?: string;
}

/** An explicit id crosswalk: pairs of case ids that mean the same case. */
export interface Crosswalk {
  pairs: [string, string][];
}

/** How one source contributed. */
export interface SourceContribution {
  id: string;
  name: string;
  cases: number;
  events: number;
  /** Rows with no case id — they cannot be attributed to anything. */
  droppedRows: number;
}

/** A case moving from one system to the next. */
export interface Handover {
  from: string;
  to: string;
  count: number;
  /** Median elapsed time between the last event in `from` and the first in `to`. */
  medianGapMs: number;
}

export interface MergeAssessment {
  sources: SourceContribution[];
  /** Distinct cases after unification. */
  totalCases: number;
  /** Cases seen in more than one source — the ones the merge is actually for. */
  sharedCases: number;
  /** Cases seen in exactly one source. */
  soloCases: number;
  /** The same case+activity+instant reported by two systems. Not de-duplicated:
   *  which one is redundant is a business question, not a parsing one. */
  duplicateEvents: number;
  /** How cases were tied together. */
  linkedBy: "case id" | "shared key" | "crosswalk" | "none";
  /** `no-overlap` means the merge cannot work as specified — refuse it. */
  verdict: "ok" | "thin-overlap" | "no-overlap";
  /** One line, written for the person about to press Import. */
  message: string;
  warnings: string[];
  /** Cross-system delay, measured before anything is stored. */
  handovers: Handover[];
}

export interface MergeResult {
  headers: string[];
  rows: string[][];
  mapping: Partial<LogMapping>;
  assessment: MergeAssessment;
}

/** Union-find over id tokens, so a chain of links resolves to one case. */
class Unifier {
  private parent = new Map<string, string>();
  find(x: string): string {
    let root = this.parent.get(x);
    if (root === undefined) { this.parent.set(x, x); return x; }
    while (root !== this.parent.get(root)) root = this.parent.get(root)!;
    // Path compression, iteratively — a long crosswalk chain would otherwise
    // recurse as deep as the chain is long.
    let cur = x;
    while (cur !== root) { const next = this.parent.get(cur)!; this.parent.set(cur, root); cur = next; }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a), rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface Ev {
  srcIdx: number;
  rawCase: string;
  tsMs: number | null;
  values: Partial<Record<Role, string>>;
  attrs: Record<string, string>;
  /** Order within the source file — the tie-break when timestamps are equal. */
  seq: number;
}

const idTok = (raw: string) => `id:${raw}`;
const keyTok = (raw: string) => `key:${raw}`;

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/**
 * Merge staged exports into one long-format table.
 *
 * The result carries its own assessment, so the banner a user reads before
 * importing is computed from the very rows that get imported — there is no
 * second code path that could disagree with it.
 */
export function mergeSources(sources: MergeSource[], crosswalk?: Crosswalk): MergeResult {
  const warnings: string[] = [];

  // ── Read every source into one normalised event list ──────────────────────
  const events: Ev[] = [];
  const contributions: SourceContribution[] = [];
  const attrColumns: string[] = [];          // kept spare columns, first-appearance order
  const attrModes = new Map<string, "keep" | "hash">();
  const rolesUsed = new Set<Role>(["caseId", "activity", "timestamp"]);
  const activityState: Record<string, string> = {};
  const activityResource: Record<string, string> = {};
  const linkTokensBySource: [string, string][][] = [];

  sources.forEach((src, srcIdx) => {
    const col = new Map<string, number>();
    src.headers.forEach((h, i) => { if (!col.has(h)) col.set(h, i); });

    const roleIdx = {} as Record<Role, number | undefined>;
    for (const role of ROLE_ORDER) {
      const header = src.mapping[role];
      const i = typeof header === "string" ? col.get(header) : undefined;
      roleIdx[role] = i;
      if (i !== undefined) {
        rolesUsed.add(role);
        // A role column's own mode travels with the ROLE, not the file's column
        // name — "hash the case id" must survive being renamed to "Case".
        const mode = src.mapping.attributeMode?.[header as string];
        if (mode === "hash") attrModes.set(ROLE_HEADER[role], "hash");
      }
    }

    // Kept spare columns keep their own header: two systems using the same
    // header name mean the same thing, which is the natural reading.
    const spare: { header: string; idx: number }[] = [];
    for (const [header, mode] of Object.entries(src.mapping.attributeMode ?? {})) {
      if (mode === "drop") continue;
      const i = col.get(header);
      if (i === undefined) continue;
      const isRole = ROLE_ORDER.some((r) => src.mapping[r] === header);
      if (isRole) continue;                    // handled above, under its role header
      spare.push({ header, idx: i });
      if (!attrColumns.includes(header)) attrColumns.push(header);
      // Strictest wins: if one system calls a column identifying, it is.
      if (mode === "hash" || attrModes.get(header) !== "hash") attrModes.set(header, mode);
    }

    const linkIdx = src.linkColumn ? col.get(src.linkColumn) : undefined;
    const linkTokens: [string, string][] = [];

    const caseIdx = roleIdx.caseId;
    const seen = new Set<string>();
    let dropped = 0;
    let kept = 0;

    src.rows.forEach((row, seq) => {
      const rawCase = caseIdx === undefined ? "" : (row[caseIdx] ?? "").trim();
      if (!rawCase) { dropped++; return; }     // cannot be attributed to any case
      seen.add(rawCase);
      kept++;

      const values: Partial<Record<Role, string>> = {};
      for (const role of ROLE_ORDER) {
        const i = roleIdx[role];
        if (i !== undefined) values[role] = (row[i] ?? "").trim();
      }
      const attrs: Record<string, string> = {};
      for (const s of spare) attrs[s.header] = (row[s.idx] ?? "").trim();

      const link = linkIdx === undefined ? "" : (row[linkIdx] ?? "").trim();
      if (link) linkTokens.push([rawCase, link]);

      events.push({
        srcIdx, rawCase, seq,
        tsMs: parseTimestamp(values.timestamp ?? ""),
        values, attrs,
      });
    });

    linkTokensBySource.push(linkTokens);
    contributions.push({ id: src.id, name: src.name, cases: seen.size, events: kept, droppedRows: dropped });
    if (dropped > 0) warnings.push(`${src.name}: ${dropped.toLocaleString()} row${dropped === 1 ? "" : "s"} had no case id and were left out.`);

    // Activity→state / activity→team tables merge; the first source to name an
    // activity wins, and a disagreement is said out loud rather than resolved.
    for (const [k, v] of Object.entries(src.mapping.activityState ?? {})) {
      if (activityState[k] === undefined) activityState[k] = v;
      else if (activityState[k] !== v) warnings.push(`Activity "${k}" maps to state "${activityState[k]}" in one file and "${v}" in ${src.name} — keeping the first.`);
    }
    for (const [k, v] of Object.entries(src.mapping.activityResource ?? {})) {
      if (activityResource[k] === undefined) activityResource[k] = v;
      else if (activityResource[k] !== v) warnings.push(`Activity "${k}" maps to team "${activityResource[k]}" in one file and "${v}" in ${src.name} — keeping the first.`);
    }
  });

  // ── Unify case ids ────────────────────────────────────────────────────────
  const u = new Unifier();
  let usedKey = false, usedCrosswalk = false;
  for (const ev of events) u.find(idTok(ev.rawCase));      // every id is at least its own class
  for (const tokens of linkTokensBySource) {
    for (const [rawCase, link] of tokens) {
      u.union(idTok(rawCase), keyTok(link));
      usedKey = true;
    }
  }
  for (const [a, b] of crosswalk?.pairs ?? []) {
    if (!a || !b) continue;
    u.union(idTok(a), idTok(b));
    usedCrosswalk = true;
  }

  // Canonical id per class: the id from the EARLIEST source that has one, so the
  // merged case ids read as the primary system's, not an arbitrary winner.
  const firstSourceOfId = new Map<string, number>();
  for (const ev of events) {
    const prev = firstSourceOfId.get(ev.rawCase);
    if (prev === undefined || ev.srcIdx < prev) firstSourceOfId.set(ev.rawCase, ev.srcIdx);
  }
  const bestByRoot = new Map<string, { id: string; src: number }>();
  for (const [rawId, src] of firstSourceOfId) {
    const root = u.find(idTok(rawId));
    const cur = bestByRoot.get(root);
    if (!cur || src < cur.src || (src === cur.src && rawId < cur.id)) bestByRoot.set(root, { id: rawId, src });
  }
  const canonical = (rawId: string) => bestByRoot.get(u.find(idTok(rawId)))?.id ?? rawId;

  // ── Overlap, duplicates, handovers ────────────────────────────────────────
  const sourcesOfCase = new Map<string, Set<number>>();
  for (const ev of events) {
    const c = canonical(ev.rawCase);
    const set = sourcesOfCase.get(c) ?? new Set<number>();
    set.add(ev.srcIdx);
    sourcesOfCase.set(c, set);
  }
  let sharedCases = 0;
  for (const set of sourcesOfCase.values()) if (set.size > 1) sharedCases++;
  const totalCases = sourcesOfCase.size;
  const soloCases = totalCases - sharedCases;

  // ── Order, then emit ──────────────────────────────────────────────────────
  // Unparseable timestamps sort last within their case rather than being thrown
  // away here: `buildEventLog` drops them and COUNTS them, and one authority for
  // "rows dropped" is better than two.
  const ordered = events
    .map((ev) => ({ ev, c: canonical(ev.rawCase) }))
    .sort((a, b) =>
      (a.c < b.c ? -1 : a.c > b.c ? 1 : 0) ||
      ((a.ev.tsMs ?? Number.MAX_SAFE_INTEGER) - (b.ev.tsMs ?? Number.MAX_SAFE_INTEGER)) ||
      (a.ev.srcIdx - b.ev.srcIdx) ||
      (a.ev.seq - b.ev.seq));

  let duplicateEvents = 0;
  const gaps = new Map<number, number[]>();   // source-pair, packed as from*n+to
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1], cur = ordered[i];
    if (prev.c !== cur.c) continue;
    if (prev.ev.srcIdx === cur.ev.srcIdx) continue;
    if (prev.ev.tsMs !== null && prev.ev.tsMs === cur.ev.tsMs && prev.ev.values.activity === cur.ev.values.activity) {
      duplicateEvents++;
      continue;                                 // the same event twice is not a handover
    }
    if (prev.ev.tsMs === null || cur.ev.tsMs === null) continue;
    const key = prev.ev.srcIdx * sources.length + cur.ev.srcIdx;
    const list = gaps.get(key) ?? [];
    list.push(cur.ev.tsMs - prev.ev.tsMs);
    gaps.set(key, list);
  }
  const handovers: Handover[] = [...gaps.entries()]
    .map(([key, list]) => ({
      from: sources[Math.floor(key / sources.length)].name,
      to: sources[key % sources.length].name,
      count: list.length,
      medianGapMs: median(list),
    }))
    .sort((a, b) => b.count - a.count);

  const optionalRoles = ROLE_ORDER.filter((r) => r !== "caseId" && r !== "activity" && r !== "timestamp" && rolesUsed.has(r));
  const headers = [
    ROLE_HEADER.caseId, ROLE_HEADER.activity, ROLE_HEADER.timestamp,
    ...optionalRoles.map((r) => ROLE_HEADER[r]),
    SOURCE_COLUMN,
    ...attrColumns,
  ];
  const rows = ordered.map(({ ev, c }) => {
    const out = [c, ev.values.activity ?? "", ev.values.timestamp ?? ""];
    for (const r of optionalRoles) out.push(ev.values[r] ?? "");
    out.push(sources[ev.srcIdx].name);
    for (const a of attrColumns) out.push(ev.attrs[a] ?? "");
    return out;
  });

  const attributeMode: Record<string, "keep" | "hash" | "drop"> = {};
  for (const [k, v] of attrModes) attributeMode[k] = v;
  // Provenance is kept by default — without it the merge is unrecoverable after
  // import, and it is the column the cross-system questions are asked of.
  attributeMode[SOURCE_COLUMN] = "keep";

  const mapping: Partial<LogMapping> = {
    caseId: ROLE_HEADER.caseId,
    activity: ROLE_HEADER.activity,
    timestamp: ROLE_HEADER.timestamp,
    ...Object.fromEntries(optionalRoles.map((r) => [r, ROLE_HEADER[r]])),
    attributeMode,
  };
  if (Object.keys(activityState).length) mapping.activityState = activityState;
  if (Object.keys(activityResource).length) mapping.activityResource = activityResource;

  // ── The verdict ───────────────────────────────────────────────────────────
  const linkedBy: MergeAssessment["linkedBy"] =
    usedCrosswalk ? "crosswalk" : usedKey ? "shared key" : sharedCases > 0 ? "case id" : "none";

  let verdict: MergeAssessment["verdict"] = "ok";
  let message: string;
  if (sources.length < 2) {
    message = `${contributions[0]?.events.toLocaleString() ?? 0} events from one file.`;
  } else if (sharedCases === 0) {
    verdict = "no-overlap";
    message = "No case appears in more than one of these files. Either they describe different cases, or the systems use different ids — link them on a shared key, or supply a crosswalk.";
  } else if (sharedCases / Math.max(1, totalCases) < 0.05) {
    verdict = "thin-overlap";
    message = `Only ${sharedCases.toLocaleString()} of ${totalCases.toLocaleString()} cases appear in more than one file (${(100 * sharedCases / totalCases).toFixed(1)}%). That usually means the ids only partly line up — check before importing.`;
  } else {
    message = `${totalCases.toLocaleString()} cases, ${sharedCases.toLocaleString()} of them spanning more than one system, linked by ${linkedBy}.`;
  }
  if (duplicateEvents > 0) {
    warnings.push(`${duplicateEvents.toLocaleString()} event${duplicateEvents === 1 ? " is" : "s are"} reported identically by two systems. Both are kept — which one is redundant is a business question.`);
  }

  return {
    headers, rows, mapping,
    assessment: {
      sources: contributions, totalCases, sharedCases, soloCases, duplicateEvents,
      linkedBy, verdict, message, warnings, handovers,
    },
  };
}

/**
 * Read a two-column crosswalk file into id pairs — the first column's id and the
 * second column's id name the same case.
 *
 * The file is read like every other file here: its first row is a header, and
 * the CSV parser has already taken it, so `rows` is just the pairs. A row
 * missing either id is not a pair and is skipped; the caller reports how many
 * pairs were understood, so a file of the wrong shape shows up as "0 pairs"
 * rather than as a merge that quietly did nothing.
 */
export function parseCrosswalk(rows: string[][]): Crosswalk {
  const pairs: [string, string][] = [];
  for (const row of rows) {
    const a = (row[0] ?? "").trim(), b = (row[1] ?? "").trim();
    if (a && b) pairs.push([a, b]);
  }
  return { pairs };
}
