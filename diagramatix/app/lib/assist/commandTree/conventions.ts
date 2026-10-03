/**
 * The conventions — what each <variable> in a command pattern means, and how it
 * takes words. This is the table the SuperAdmin tile shows and edits (slice 2).
 *
 * Paul, 2026-10-01 (the four names are his):
 *   <existing_element_name>  an activity (task, collapsed or expanded subprocess), pool, lane or sublane
 *   <existing_label_name>    the label of an event, message, connector, data object, data store or gateway
 *   <new_element_name>       what the user is about to name an element
 *   <new_label_name>         what the user is about to name a label
 * plus <number>, <distance> and <target> (this / that / these / selected / the one under the cursor).
 *
 * Pure.
 */

export type SlotKind =
  /** Free dictated text — a new name. Takes everything up to the end of the command. */
  | "free"
  /** A name that already exists on the diagram (`source` says which kind of name). */
  | "names"
  /** One spoken or typed number. */
  | "number"
  /** An amount: "100 pixels", "two steps", "a bit", "one and a half tasks". */
  | "distance"
  /** One of a set of phrases, written in the same notation (`pattern`). */
  | "pattern";

export interface SlotDef {
  /** Without the angle brackets: "existing_element_name". */
  name: string;
  kind: SlotKind;
  /** For kind "names": whose names. */
  source?: "elements" | "labels";
  /** For kind "pattern": the phrases, in the notation (may use {lists}). */
  pattern?: string;
  /** What it means, in the tile's words. */
  means: string;
  /** One example of what is said. */
  example: string;
  /** Most words it will take before it stops following the speaker (default 12; 6 for a name that is not recognised). */
  maxWords?: number;
}

export type Conventions = SlotDef[];

export const DEFAULT_CONVENTIONS: Conventions = [
  {
    name: "existing_element_name",
    kind: "names",
    source: "elements",
    means: "The name of an activity (task, collapsed subprocess or expanded subprocess), pool, lane or sublane that is already on the diagram.",
    example: "Review Claim",
  },
  {
    name: "existing_label_name",
    kind: "names",
    source: "labels",
    means: "The label of an event, message, connector, data object, data store or gateway that is already on the diagram.",
    example: "Payment Details",
  },
  {
    name: "new_element_name",
    kind: "free",
    means: "What the user is about to name an activity, pool, lane or sublane. Free speech; it ends the command.",
    example: "Finance Review",
  },
  {
    name: "new_diagram_name",
    kind: "free",
    means: "What the user is about to name a NEW diagram (collapse a subprocess into one). Free speech; it ends the command. Left out, the diagram takes the subprocess's name.",
    example: "Handle Error Process",
  },
  {
    name: "new_label_name",
    kind: "free",
    means: "What the user is about to name an event, message, connector, data object, data store or gateway. Free speech; it ends the command.",
    example: "Approved",
  },
  {
    name: "selection",
    kind: "pattern",
    pattern: "(these|those|the selected {target_kinds})",
    means: "The things selected on the diagram, as a group: these, those, the selected tasks. (A few commands also take a bare “selected”; those say so in their own pattern.)",
    example: "these",
  },
  {
    name: "number",
    kind: "number",
    means: "A number, spoken (“three”) or as a digit. Used for green-number picks, counts and positions.",
    example: "3",
  },
  {
    name: "distance",
    kind: "distance",
    means: "How far: pixels or a count of steps, tasks or elements, or “a bit”.",
    example: "100 pixels",
  },
  {
    name: "target",
    kind: "pattern",
    pattern: "(this|that|these|those|it|[the] selected [{target_kinds}]|[the] one under the (cursor|pointer|mouse)|(this|that) one (here|there))",
    means: "Pointing instead of naming: the selection, or the element under the cursor. “this” and “that” mean the selection, then what the cursor is on, then the last one added.",
    example: "this",
  },
];

/** Words a <distance> may be made of. */
export const DISTANCE_WORDS = new Set([
  "a", "an", "bit", "little", "half", "and", "by", "more", "again",
  "hundred", "thousand", "pixel", "pixels", "px", "step", "steps", "task", "tasks", "element", "elements",
  "space", "spaces", "cell", "cells", "place", "places",
]);

/** Spoken number words a <number> or <distance> may use (kept to what spokenNumber.ts reads). */
export const NUMBER_WORD_SET = new Set([
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
  "thirty", "forty", "fourty", "fifty", "sixty", "seventy", "eighty", "ninety",
]);

export const isNumberToken = (t: string): boolean => /^\d+(?:\.\d+)?$/.test(t) || NUMBER_WORD_SET.has(t);

export function slotDefOf(conv: Conventions, name: string): SlotDef | undefined {
  return conv.find((s) => s.name === name);
}
