/**
 * Speaking about a boundary event — "add a timer boundary event called Timeout
 * to Review".
 *
 * One reading of the phrase, for the command grammar and for the add-word
 * repair's list of things an add can name (`BOUNDARY_EVENT_NOUN`). It follows
 * `poolBoundaryPhrase.ts`: the grammar asks, and gets an answer it can turn
 * straight into an op.
 *
 * NEVER A TASK, NEVER HOSTLESS. With the mouse, a boundary event exists only as
 * an event dropped within snapping distance of a task or subprocess edge (or
 * attached from the Properties panel); dropped anywhere else it stays a free
 * intermediate event. The voice has to match. Before 2026-09-25 the grammar
 * read only "boundary event" said straight after the article and only with a
 * "to <host>", so:
 *
 *   "add a boundary event called Timeout"        → a TASK called Timeout
 *   "add an error boundary event called Failed"  → a TASK called Failed
 *   "add a timer boundary event to Review"       → a LOOSE timer event named
 *                                                  "Boundary event to Review",
 *                                                  reported as if it had worked
 *
 * Now the trigger word and "non-interrupting" are read, and a phrase with no
 * host comes back without one. Paul, 2026-09-25, on what that means: "Use the
 * selected task" — the apply layer mounts it on the single selected task or
 * subprocess, and otherwise refuses and says what to say.
 *
 * Pure.
 */
import { EVENT_OPTS } from "../diagram/elementSubtypes";
import type { EventType } from "../diagram/types";
import { containsAnotherCommand } from "./commandVerbs";
import { wordAlternation } from "./containerWords";

/**
 * The triggers a boundary event can carry, spoken — the right-click menu's own
 * list (`EVENT_OPTS`, which "make this a timer event" also reads), less three:
 * "none" (no word is the plain event), and the two BPMN never mounts on an
 * activity — terminate (an end event only) and link (a pair of intermediate
 * events in the flow).
 */
const TRIGGER_BY_WORD = new Map<string, EventType>();
for (const o of EVENT_OPTS) {
  if (o.value === "none" || o.value === "terminate" || o.value === "link") continue;
  TRIGGER_BY_WORD.set(o.value.toLowerCase(), o.value as EventType);
  TRIGGER_BY_WORD.set(o.label.toLowerCase(), o.value as EventType);
}
const TRIGGER_ALT = wordAlternation([...TRIGGER_BY_WORD.keys()]);
const NON_INTERRUPTING = "non[-\\s]?interrupting";

/**
 * The noun phrase itself — "[non-interrupting] [timer] [non-interrupting]
 * boundary event(s)" — as regex source with no capturing groups, for a caller
 * that needs to recognise it inside a longer pattern.
 */
export const BOUNDARY_EVENT_NOUN =
  `(?:${NON_INTERRUPTING}\\s+)?(?:(?:${TRIGGER_ALT})\\s+)?(?:${NON_INTERRUPTING}\\s+)?boundary\\s+events?`;

const VERBS = "add|insert|put|attach|create|place";
const PHRASE_RE = new RegExp(
  `^(?:${VERBS})\\s+(?:(?:a|an|the)\\s+)?(?:new\\s+)?(${NON_INTERRUPTING}\\s+)?(?:(${TRIGGER_ALT})\\s+)?(${NON_INTERRUPTING}\\s+)?boundary\\s+events?(?:\\s+(.*))?$`,
  "i",
);

const NAMED = "(?:called|named|labell?ed|titled)";
const HOST_WORD = "(?:to|on|onto)";

const clean = (s: string) =>
  s.trim().replace(/[.,!?;:]+$/g, "").replace(/^["'“”‘’]+|["'“”‘’]+$/g, "").trim();

/**
 * The trigger a boundary event's NAME implies — Paul, 2026-10-02: "Use the wording of the proposed boundary
 * event to set the event trigger. If the words error, cancellation, receive or escalate occur in the event
 * name, set the trigger to Error, Cancel, Message or Escalation respectively. If any phrase with time or date
 * is part of the name then set the trigger to Timer."
 *
 * Used ONLY when the sentence did not say a trigger itself ("add a timer boundary event …" always wins), and
 * only for a name that was given. The four words are matched by stem (error → errors; cancel → cancellation,
 * cancelled; receiv → receive, received; escalat → escalate, escalation). A time or date phrase is a clock
 * time, a date or weekday or month, a duration ("after 3 days"), a recurrence ("every week", "daily"), or the
 * words time / timer / timeout / date / deadline / overdue / expire. A name with both reads as the words first:
 * "Escalate after 3 days" is an escalation, since the words were the first thing he listed.
 *
 * Pure.
 */
const MONTHS = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec";
const WEEKDAYS = "monday|tuesday|wednesday|thursday|friday|saturday|sunday";
const COUNT = "\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|several|few";
const UNITS = "seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|fortnights?|months?|quarters?|years?";
const TIME_OR_DATE = new RegExp(
  [
    "\\btime(?:r|rs|out|outs|-out|d out|d-out)?\\b",
    "\\btime\\s*limit\\b",
    "\\bdates?\\b",
    "\\bdeadlines?\\b",
    "\\boverdue\\b",
    "\\bexpir(?:e|es|ed|y|ation)\\b",
    `\\b(?:\\d+\\s*|(?:${COUNT})\\s+)(?:${UNITS})\\b`,
    "\\b(?:daily|weekly|fortnightly|monthly|quarterly|yearly|annually|hourly|nightly)\\b",
    "\\bevery\\s+(?:\\w+\\s+)?(?:day|night|week|month|year|hour|minute|morning|afternoon|evening|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\\b",
    "\\b(?:midnight|noon|midday|today|tomorrow|tonight|end of (?:day|week|month|year))\\b",
    "\\b\\d{1,2}:\\d{2}\\b",
    "\\b\\d{1,2}\\s*(?:am|pm)\\b",
    `\\b(?:${WEEKDAYS})\\b`,
    `\\b(?:${MONTHS})\\b`,
    "\\b\\d{1,2}(?:st|nd|rd|th)\\b",
    "\\b\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?\\b",
  ].join("|"),
  "i",
);

export function inferBoundaryTrigger(name: string | undefined): EventType | undefined {
  const t = String(name ?? "").trim();
  if (!t) return undefined;
  if (/\berror/i.test(t)) return "error";
  if (/\bcancel/i.test(t)) return "cancel";
  if (/\breceiv/i.test(t)) return "message";
  if (/\bescalat/i.test(t)) return "escalation";
  if (TIME_OR_DATE.test(t)) return "timer";
  return undefined;
}

export interface BoundaryEventPhrase {
  /** Absent when no host was named — the apply layer then uses the selection. */
  hostRef?: string;
  label?: string;
  eventType?: EventType;
  nonInterrupting?: true;
}

/**
 * Read a boundary-event command.
 *
 * - `null` — not a boundary-event sentence at all; other rules may have it.
 * - `"unreadable"` — it IS one, but the tail is something this cannot place
 *   ("… here", "… after Review", or a name that runs on into a second
 *   command). The caller declines the whole sentence so the AI reads it,
 *   rather than letting a greedier rule make a task of it.
 * - otherwise the parts, with `hostRef` absent when no host was said.
 */
export function parseBoundaryEventPhrase(raw: string): BoundaryEventPhrase | "unreadable" | null {
  const m = clean(raw).match(PHRASE_RE);
  if (!m) return null;

  const out: BoundaryEventPhrase = {};
  if (m[2]) {
    const t = TRIGGER_BY_WORD.get(m[2].toLowerCase().replace(/\s+/g, " "));
    if (t) out.eventType = t;
  }
  if (m[1] || m[3]) out.nonInterrupting = true;

  const rest = clean(m[4] ?? "");
  if (!rest) return out;

  const calledTo = rest.match(new RegExp(`^${NAMED}\\s+(.+?)\\s+${HOST_WORD}\\s+(.+)$`, "i"));
  const toCalled = rest.match(new RegExp(`^${HOST_WORD}\\s+(.+?)\\s+${NAMED}\\s+(.+)$`, "i"));
  const onlyTo = rest.match(new RegExp(`^${HOST_WORD}\\s+(.+)$`, "i"));
  const onlyCalled = rest.match(new RegExp(`^${NAMED}\\s+(.+)$`, "i"));
  if (calledTo) { out.label = clean(calledTo[1]); out.hostRef = clean(calledTo[2]); }
  else if (toCalled) { out.hostRef = clean(toCalled[1]); out.label = clean(toCalled[2]); }
  else if (onlyTo) { out.hostRef = clean(onlyTo[1]); }
  else if (onlyCalled) {
    // A name that carries a second command is two sentences run together —
    // "add a boundary event called Timeout add a task called Escalate". Taken
    // as one name, the task would silently never be added.
    if (containsAnotherCommand(onlyCalled[1])) return "unreadable";
    out.label = clean(onlyCalled[1]);
  } else {
    return "unreadable";
  }
  if (out.hostRef === "" || out.label === "") return "unreadable";
  return out;
}
