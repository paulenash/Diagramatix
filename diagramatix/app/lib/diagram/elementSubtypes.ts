/**
 * The element subtypes a user can convert between, in one table.
 *
 * These lists WERE private consts inside `ElementContextMenu.tsx`. M3 adds a
 * spoken form of the same choice — "make this a user task", "make the selected
 * gateway parallel" — and a second copy of the vocabulary would go stale the
 * first time a subtype was added to one and not the other. So the menu and the
 * grammar now read the same rows, and `appliesTo` records which element types
 * each group is offered for, which the menu knew implicitly through its
 * `switch` and the voice path needs stated.
 *
 * This is a **property** change, not a shape change: the element keeps its
 * type and gains (or loses) a marker. Converting a task INTO a gateway is a
 * different operation with its own reducer actions (`CONVERT_TASK_SUBPROCESS`
 * and friends) and is deliberately not here.
 *
 * Pure.
 */

export type SubtypeOption = { value: string; label: string };

export type SubtypeGroup = {
  /** The element property a pick writes. */
  propKey: string;
  /** Section header in the right-click menu. */
  header: string;
  /** Element types this group is offered for. */
  appliesTo: readonly string[];
  /**
   * Spoken nouns that identify this group — "a user **task**", "a parallel
   * **gateway**". Longest match wins, so "data object" beats nothing.
   */
  nouns: readonly string[];
  opts: readonly SubtypeOption[];
};

export const TASK_OPTS: SubtypeOption[] = [
  { value: "none",          label: "None" },
  { value: "user",          label: "User" },
  { value: "service",       label: "Service" },
  { value: "script",        label: "Script" },
  { value: "send",          label: "Send" },
  { value: "receive",       label: "Receive" },
  { value: "manual",        label: "Manual" },
  { value: "business-rule", label: "Business Rule" },
];

export const GATEWAY_OPTS: SubtypeOption[] = [
  { value: "none",        label: "None" },
  { value: "exclusive",   label: "Exclusive ×" },
  { value: "inclusive",   label: "Inclusive ○" },
  { value: "parallel",    label: "Parallel +" },
  { value: "event-based", label: "Event-based ⬠" },
];

export const ROLE_OPTS: SubtypeOption[] = [
  { value: "decision", label: "Decision" },
  { value: "merge",    label: "Merge" },
];

export const SUBPROCESS_OPTS: SubtypeOption[] = [
  { value: "normal",      label: "Normal" },
  { value: "call",        label: "Call" },
  { value: "event",       label: "Event" },
  { value: "transaction", label: "Transaction" },
];

export const REPEAT_OPTS: SubtypeOption[] = [
  { value: "none",          label: "None" },
  { value: "loop",          label: "Loop" },
  { value: "mi-sequential", label: "MI Sequential" },
  { value: "mi-parallel",   label: "MI Parallel" },
];

export const DATA_OBJECT_OPTS: SubtypeOption[] = [
  { value: "none",   label: "None" },
  { value: "input",  label: "Input" },
  { value: "output", label: "Output" },
];

export const EVENT_OPTS: SubtypeOption[] = [
  { value: "none",         label: "None" },
  { value: "message",      label: "Message" },
  { value: "timer",        label: "Timer" },
  { value: "error",        label: "Error" },
  { value: "signal",       label: "Signal" },
  { value: "terminate",    label: "Terminate" },
  { value: "conditional",  label: "Conditional" },
  { value: "escalation",   label: "Escalation" },
  { value: "cancel",       label: "Cancel" },
  { value: "compensation", label: "Compensation" },
  { value: "link",         label: "Link" },
];

/**
 * Flow direction — only meaningful for intermediate events. Start events are
 * always catching and end events always throwing, so they do not get this.
 */
export const FLOW_TYPE_OPTS: SubtypeOption[] = [
  { value: "none",     label: "None" },
  { value: "catching", label: "Catching" },
  { value: "throwing", label: "Throwing" },
];

const EVENT_TYPES = ["start-event", "intermediate-event", "end-event"] as const;
const SUBPROCESS_TYPES = ["subprocess", "subprocess-expanded"] as const;

export const SUBTYPE_GROUPS: readonly SubtypeGroup[] = [
  {
    propKey: "taskType", header: "Task Type",
    appliesTo: ["task"], nouns: ["task", "activity", "step"], opts: TASK_OPTS,
  },
  {
    propKey: "gatewayType", header: "Gateway Type",
    appliesTo: ["gateway"], nouns: ["gateway", "decision"], opts: GATEWAY_OPTS,
  },
  {
    propKey: "gatewayRole", header: "Role",
    appliesTo: ["gateway"], nouns: ["gateway"], opts: ROLE_OPTS,
  },
  {
    propKey: "subprocessType", header: "Sub-Process Usage",
    appliesTo: [...SUBPROCESS_TYPES], nouns: ["subprocess", "sub-process", "sub process"],
    opts: SUBPROCESS_OPTS,
  },
  {
    propKey: "repeatType", header: "Repeat",
    appliesTo: [...SUBPROCESS_TYPES], nouns: ["subprocess", "sub-process", "sub process"],
    opts: REPEAT_OPTS,
  },
  {
    propKey: "eventType", header: "Trigger",
    appliesTo: [...EVENT_TYPES], nouns: ["event"], opts: EVENT_OPTS,
  },
  {
    propKey: "flowType", header: "Flow Type",
    appliesTo: ["intermediate-event"], nouns: ["event"], opts: FLOW_TYPE_OPTS,
  },
  {
    propKey: "role", header: "Role",
    appliesTo: ["data-object"], nouns: ["data object", "data-object", "data"],
    opts: DATA_OBJECT_OPTS,
  },
];

/** Every element type any group is offered for. */
export const CONVERTIBLE_TYPES: ReadonlySet<string> = new Set(
  SUBTYPE_GROUPS.flatMap((g) => g.appliesTo),
);

/**
 * R5 — a fingerprint of an element's subtype markers, for change detection.
 *
 * The gold flash works out what to outline by diffing the diagram before and
 * after — deliberately, so that thirty-odd op handlers cannot drift out of
 * agreement about what they touched. But the diff can only see what it
 * compares, and it compared position, parent and label. A subtype change moves
 * nothing and renames nothing, so it flashed nothing.
 *
 * That is the same defect Paul reported for renames on 18 September, arriving
 * again through a different door, which is why this is derived from
 * `SUBTYPE_GROUPS` rather than listing the properties by hand: a subtype added
 * to the menu is covered here the same day.
 *
 * Some of these live at the top level of an element and some under
 * `properties`, so both are read.
 */
export function subtypeFingerprint(
  el: { properties?: Record<string, unknown> } & Record<string, unknown>,
): string {
  const parts: string[] = [];
  for (const g of SUBTYPE_GROUPS) {
    const v = el[g.propKey] ?? el.properties?.[g.propKey];
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${g.propKey}=${String(v)}`);
  }
  return parts.join("|");
}
