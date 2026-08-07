/**
 * Deterministic "Diff Processes" engine — compares two versions of the same
 * BPMN process and reports WHERE they differ across three dimensions the user
 * cares about:
 *   - WHO does what  → the responsible role (lane, else pool) of each activity
 *   - WHAT systems   → IT systems / data stores each activity touches
 *   - WHAT is done   → the activity itself + its task type (user/service/…)
 *
 * It reuses the SOP `extractSkeleton` extraction (the same no-AI structured
 * model that grounds SOP generation), so activities, roles and systems are
 * resolved exactly as everywhere else. Activities are matched across versions
 * by NORMALISED label; unmatched extras are Added / Removed, matched ones with
 * any dimension change are Changed, otherwise Unchanged. Pure + synchronous so
 * it runs client-side and is trivially testable.
 */
import type { DiagramData } from "../types";
import { extractSkeleton } from "../../sop/extractSkeleton";
import type { SopStep } from "../../sop/skeleton";

export type DiffStatus = "added" | "removed" | "changed" | "unchanged";

/** A single dimension's before/after with a computed `changed` flag. */
export interface DiffField<T> {
  a?: T;
  b?: T;
  changed: boolean;
}

export interface ProcessDiffRow {
  /** Canonical activity label (from version B when present, else A). */
  activity: string;
  status: DiffStatus;
  /** Human-readable list of what changed (empty unless status === "changed"). */
  changes: string[];
  who: DiffField<string>;                 // responsible role (lane/pool)
  taskType: DiffField<string>;            // user/service/send/receive/… ("what is done")
  systems: DiffField<string[]>;           // IT systems / data stores ("what systems")
  data: DiffField<string[]>;              // inputs + outputs (data objects handled)
  /** What a task-type (marker) change signifies — e.g. "Automation introduced".
   *  Set only when the marker change crosses an automation boundary. */
  automationNote?: string;
  /** Global step numbers in each version, for reference. */
  stepNoA?: number;
  stepNoB?: number;
}

/** A task whose marker (User / Service / Manual / Script …) changed in a way that
 *  signals an automation shift. */
export interface AutomationChange { activity: string; from: string; to: string; note: string }

export interface ProcessDiffSide {
  title: string;
  roles: string[];
  systems: string[];
  stepCount: number;
}

/** A BPMN message flow, described by its endpoint labels + message name so it
 *  can be matched across two diagrams (whose element ids differ). */
export interface MessageFlow { from: string; to: string; label: string }

export interface MessageDiff {
  added: MessageFlow[];                                          // in B only
  removed: MessageFlow[];                                        // in A only
  /** Same endpoints, different message name. */
  changed: { from: string; to: string; a: string; b: string }[];
  unchanged: number;
}

/** An intermediate event — inline in the flow, or edge-mounted (boundary) on a
 *  host activity. `trigger` = timer / error / escalation / cancel / message /
 *  signal / compensation / conditional / link / none. */
export interface EventFlow {
  kind: "boundary" | "intermediate";
  host: string;          // host activity label (boundary only, else "")
  trigger: string;
  label: string;
  interrupting: boolean; // boundary: false = non-interrupting
  throwing: boolean;     // inline throw event
}

export interface EventDiff {
  added: EventFlow[];
  removed: EventFlow[];
  /** Same anchor (boundary host, or inline label), different trigger/flags. */
  changed: { kind: EventFlow["kind"]; where: string; a: string; b: string }[];
  unchanged: number;
}

export interface ProcessDiff {
  a: ProcessDiffSide;
  b: ProcessDiffSide;
  rows: ProcessDiffRow[];
  summary: Record<DiffStatus, number>;
  /** Roles present in only one version. */
  roleDiff: { added: string[]; removed: string[] };
  /** Systems present in only one version. */
  systemDiff: { added: string[]; removed: string[] };
  /** BPMN data objects present in only one version. */
  dataObjectDiff: { added: string[]; removed: string[] };
  /** Message flows added / removed / relabelled between the versions. */
  messageDiff: MessageDiff;
  /** Intermediate + boundary event changes — new/removed/retriggered timers,
   *  errors, escalations, cancellations, etc. */
  eventDiff: EventDiff;
  /** Tasks whose marker change signals an automation shift (manual→user = IT
   *  support added; user→service/script = automation / RPA / agent introduced). */
  automationChanges: AutomationChange[];
}

// Automation "level" of a BPMN task marker: 0 = manual (no IT), 1 = user (human
// with a system), 2 = system-performed (service / script / business-rule / send /
// receive). Interpreting a marker change against these levels is what turns a raw
// "User task → Service task" into "automation introduced".
const AUTOMATED = new Set(["service", "script", "business-rule", "send", "receive"]);
function automationLevel(t?: string): number | null {
  if (!t || t === "none") return null;         // no marker → don't interpret
  if (t === "manual") return 0;
  if (t === "user") return 1;
  if (AUTOMATED.has(t)) return 2;
  return null;
}

/** Interpret a task-type (marker) change as an automation shift, or null when the
 *  change doesn't cross an automation boundary. `a`/`b` are RAW task types. */
export function interpretAutomationChange(a?: string, b?: string): string | null {
  const la = automationLevel(a), lb = automationLevel(b);
  if (la === null || lb === null || la === lb) {
    // Same level but a different automated flavour (e.g. Service → Script) still
    // signals a re-automation.
    if (la === 2 && lb === 2 && a !== b) return "Automation approach changed";
    return null;
  }
  if (la === 0 && lb === 1) return "IT system support introduced (was manual)";
  if (la === 0 && lb === 2) return "Automated (was manual)";
  if (la === 1 && lb === 2) return "Automation introduced (RPA / agent / service)";
  if (la === 2 && lb === 1) return "Automation removed — now performed by a person";
  if (la === 2 && lb === 0) return "Reverted to manual (automation removed)";
  if (la === 1 && lb === 0) return "IT support removed — now manual";
  return null;
}

/** Normalise an activity label for matching: case/space-insensitive, trailing
 *  punctuation stripped. Two activities with the same normalised label are
 *  treated as the same activity across versions. */
export function normaliseLabel(s: string | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/g, "")
    .trim();
}

const sortedUniq = (xs: string[]): string[] =>
  [...new Set(xs.map((x) => x.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));

const sameSet = (a: string[], b: string[]): boolean => {
  const sa = sortedUniq(a), sb = sortedUniq(b);
  return sa.length === sb.length && sa.every((v, i) => v === sb[i]);
};

const prettyTaskType = (t?: string): string | undefined =>
  t ? t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) + " task" : undefined;

/** Group a version's steps by normalised label, preserving order within each
 *  group so duplicate-named activities pair up positionally across versions. */
function groupByLabel(steps: SopStep[]): Map<string, SopStep[]> {
  const g = new Map<string, SopStep[]>();
  for (const s of steps) {
    const k = normaliseLabel(s.label);
    if (!k) continue;
    (g.get(k) ?? g.set(k, []).get(k)!).push(s);
  }
  return g;
}

function buildRow(a: SopStep | undefined, b: SopStep | undefined): ProcessDiffRow {
  const who: DiffField<string> = { a: a?.role, b: b?.role, changed: false };
  const taskType: DiffField<string> = {
    a: prettyTaskType(a?.taskType), b: prettyTaskType(b?.taskType), changed: false,
  };
  const aSys = a ? sortedUniq(a.systems) : [];
  const bSys = b ? sortedUniq(b.systems) : [];
  const aData = a ? sortedUniq([...a.inputs, ...a.outputs]) : [];
  const bData = b ? sortedUniq([...b.inputs, ...b.outputs]) : [];
  const systems: DiffField<string[]> = { a: aSys, b: bSys, changed: false };
  const data: DiffField<string[]> = { a: aData, b: bData, changed: false };

  const activity = b?.label ?? a?.label ?? "(unnamed)";
  const row: ProcessDiffRow = {
    activity, status: "unchanged", changes: [],
    who, taskType, systems, data, stepNoA: a?.globalNo, stepNoB: b?.globalNo,
  };

  if (a && !b) { row.status = "removed"; return row; }
  if (b && !a) { row.status = "added"; return row; }

  // Matched pair — compare each dimension.
  const changes: string[] = [];
  if ((who.a ?? "") !== (who.b ?? "")) {
    who.changed = true;
    changes.push(`Role: ${who.a || "—"} → ${who.b || "—"}`);
  }
  if ((taskType.a ?? "") !== (taskType.b ?? "")) {
    taskType.changed = true;
    changes.push(`Type: ${taskType.a || "—"} → ${taskType.b || "—"}`);
    const note = interpretAutomationChange(a?.taskType, b?.taskType);
    if (note) { row.automationNote = note; changes.push(note); }
  }
  if (!sameSet(aSys, bSys)) {
    systems.changed = true;
    changes.push(`Systems: ${aSys.join(", ") || "—"} → ${bSys.join(", ") || "—"}`);
  }
  if (!sameSet(aData, bData)) {
    data.changed = true;
    changes.push(`Data: ${aData.join(", ") || "—"} → ${bData.join(", ") || "—"}`);
  }
  row.changes = changes;
  row.status = changes.length ? "changed" : "unchanged";
  return row;
}

/**
 * Compare two BPMN process versions. `aData`/`bData` are the two diagrams'
 * DiagramData; titles label the columns (A = "before"/left, B = "after"/right).
 */
export function diffProcesses(
  aData: DiagramData, aTitle: string,
  bData: DiagramData, bTitle: string,
): ProcessDiff {
  const skA = extractSkeleton(aData, { scope: "whole" });
  const skB = extractSkeleton(bData, { scope: "whole" });

  const groupsA = groupByLabel(skA.steps);
  const groupsB = groupByLabel(skB.steps);
  const keys = [...new Set([...groupsA.keys(), ...groupsB.keys()])];

  const rows: ProcessDiffRow[] = [];
  for (const k of keys) {
    const listA = groupsA.get(k) ?? [];
    const listB = groupsB.get(k) ?? [];
    const n = Math.max(listA.length, listB.length);
    for (let i = 0; i < n; i++) rows.push(buildRow(listA[i], listB[i]));
  }

  // Order rows by B's flow position, then A's (removed activities), so the table
  // reads down the "after" version with removals slotted by their old position.
  rows.sort((x, y) => {
    const bx = x.stepNoB ?? Infinity, by = y.stepNoB ?? Infinity;
    if (bx !== by) return bx - by;
    return (x.stepNoA ?? Infinity) - (y.stepNoA ?? Infinity);
  });

  const summary: Record<DiffStatus, number> = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const r of rows) summary[r.status]++;

  const only = (xs: string[], ys: string[]) => xs.filter((v) => !ys.includes(v));
  const rolesA = sortedUniq(skA.roles), rolesB = sortedUniq(skB.roles);
  const sysA = sortedUniq(skA.systems), sysB = sortedUniq(skB.systems);
  const objA = sortedUniq(skA.dataObjects), objB = sortedUniq(skB.dataObjects);

  return {
    a: { title: aTitle, roles: rolesA, systems: sysA, stepCount: skA.steps.length },
    b: { title: bTitle, roles: rolesB, systems: sysB, stepCount: skB.steps.length },
    rows,
    summary,
    roleDiff: { added: only(rolesB, rolesA), removed: only(rolesA, rolesB) },
    systemDiff: { added: only(sysB, sysA), removed: only(sysA, sysB) },
    dataObjectDiff: { added: only(objB, objA), removed: only(objA, objB) },
    messageDiff: diffMessages(extractMessages(aData), extractMessages(bData)),
    eventDiff: diffEvents(extractEvents(aData), extractEvents(bData)),
    automationChanges: rows
      .filter((r) => r.automationNote)
      .map((r) => ({ activity: r.activity, from: r.taskType.a || "—", to: r.taskType.b || "—", note: r.automationNote! })),
  };
}

const MESSAGE_TYPES = new Set(["message", "messageBPMN"]);

/** All BPMN message flows in a diagram, described by endpoint labels (element
 *  label, else its type) + the message name — the form matched across versions. */
export function extractMessages(data: DiagramData): MessageFlow[] {
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));
  const nameOf = (id: string): string => {
    const el = byId.get(id);
    return (el?.label?.trim() || el?.type || id);
  };
  const out: MessageFlow[] = [];
  for (const c of data.connectors ?? []) {
    if (!MESSAGE_TYPES.has(c.type)) continue;
    out.push({ from: nameOf(c.sourceId), to: nameOf(c.targetId), label: (c.label ?? "").trim() });
  }
  return out;
}

const pairKey = (m: MessageFlow) => `${normaliseLabel(m.from)}→${normaliseLabel(m.to)}`;
const fullKey = (m: MessageFlow) => `${pairKey(m)}|${normaliseLabel(m.label)}`;

/** Diff two message-flow lists. Exact (endpoints + name) matches are unchanged;
 *  a leftover pair present on both sides = a relabelled message (changed); the
 *  rest are added (B only) / removed (A only). */
export function diffMessages(aMsgs: MessageFlow[], bMsgs: MessageFlow[]): MessageDiff {
  // 1. Remove exact matches (same endpoints AND same message name).
  const bRemaining = [...bMsgs];
  const aRemaining: MessageFlow[] = [];
  let unchanged = 0;
  for (const m of aMsgs) {
    const i = bRemaining.findIndex((n) => fullKey(n) === fullKey(m));
    if (i >= 0) { bRemaining.splice(i, 1); unchanged++; }
    else aRemaining.push(m);
  }
  // 2. Same endpoint-pair left on both sides = a relabel (changed).
  const changed: MessageDiff["changed"] = [];
  const removed: MessageFlow[] = [];
  for (const m of aRemaining) {
    const i = bRemaining.findIndex((n) => pairKey(n) === pairKey(m));
    if (i >= 0) {
      const b = bRemaining.splice(i, 1)[0];
      changed.push({ from: m.from, to: m.to, a: m.label, b: b.label });
    } else removed.push(m);
  }
  // 3. Whatever B has left is genuinely new.
  return { added: bRemaining, removed, changed, unchanged };
}

/** All intermediate + boundary events in a diagram (throw/catch, inline/edge). */
export function extractEvents(data: DiagramData): EventFlow[] {
  const byId = new Map((data.elements ?? []).map((e) => [e.id, e]));
  const nameOf = (id: string): string => {
    const el = byId.get(id);
    return (el?.label?.trim() || el?.type || id);
  };
  const out: EventFlow[] = [];
  for (const el of data.elements ?? []) {
    if (el.type !== "intermediate-event") continue;
    const boundary = !!el.boundaryHostId;
    const p = (el.properties ?? {}) as Record<string, unknown>;
    const interrupting = !(p.interruptionType === "non-interrupting" || p.interrupting === false);
    out.push({
      kind: boundary ? "boundary" : "intermediate",
      host: boundary ? nameOf(el.boundaryHostId!) : "",
      trigger: (el.eventType as string | undefined) || "none",
      label: (el.label ?? "").trim(),
      interrupting,
      throwing: el.flowType === "throwing",
    });
  }
  return out;
}

/** Human descriptor of an event's trigger + flags ("timer (non-interrupting)"). */
export function eventTrigger(e: EventFlow): string {
  const t = e.trigger === "none" ? "plain" : e.trigger;
  const flags: string[] = [];
  if (e.kind === "boundary" && !e.interrupting) flags.push("non-interrupting");
  if (e.throwing) flags.push("throwing");
  return flags.length ? `${t} (${flags.join(", ")})` : t;
}

const evExactKey = (e: EventFlow) =>
  `${e.kind}|${normaliseLabel(e.host)}|${normaliseLabel(e.label)}|${e.trigger}|${e.interrupting ? 1 : 0}|${e.throwing ? 1 : 0}`;
// Anchor = what identifies "the same event" across versions so a trigger change
// reads as a change, not add+remove: a boundary event's host, or an inline
// event's label. Unlabelled inline events have no anchor → pure add/remove.
const evAnchor = (e: EventFlow): string | null =>
  e.kind === "boundary" ? `b|${normaliseLabel(e.host)}` : (normaliseLabel(e.label) ? `i|${normaliseLabel(e.label)}` : null);

/** Diff two event lists (same shape/approach as message flows). */
export function diffEvents(aEvents: EventFlow[], bEvents: EventFlow[]): EventDiff {
  const bRemaining = [...bEvents];
  const aRemaining: EventFlow[] = [];
  let unchanged = 0;
  for (const e of aEvents) {
    const i = bRemaining.findIndex((n) => evExactKey(n) === evExactKey(e));
    if (i >= 0) { bRemaining.splice(i, 1); unchanged++; }
    else aRemaining.push(e);
  }
  const changed: EventDiff["changed"] = [];
  const removed: EventFlow[] = [];
  for (const e of aRemaining) {
    const anchor = evAnchor(e);
    const i = anchor ? bRemaining.findIndex((n) => evAnchor(n) === anchor) : -1;
    if (i >= 0) {
      const b = bRemaining.splice(i, 1)[0];
      changed.push({ kind: e.kind, where: e.kind === "boundary" ? e.host : e.label, a: eventTrigger(e), b: eventTrigger(b) });
    } else removed.push(e);
  }
  return { added: bRemaining, removed, changed, unchanged };
}
