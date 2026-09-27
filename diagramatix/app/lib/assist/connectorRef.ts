/**
 * A connector named by its LABEL — "rename connector Payment Details to …",
 * "delete connector Rejection Notification", "remove message Payment Details" —
 * and when that beats an element of a similar name.
 *
 * THE RULE: a connector whose label is exactly what was said — the whole phrase
 * ("message 4", its default name) or what follows a leading connector/message
 * noun ("message Invoice") — beats an element the resolver matched only
 * loosely. An element named exactly what was said still wins.
 *
 * It began inside the rename (2026-09-25: "rename message 4 to Request" renamed
 * the EVENT "Event 4"). The delete never had it: on Paul's own test diagram
 * (2026-09-27) "delete connector Rejection Notification" deleted the END EVENT
 * "Send Rejection Notification", and "remove message Payment Details" found
 * nothing because the label was typed on two lines. So it lives here, once, for
 * the apply layer and for both scorers — a scorer that resolved a connector name
 * differently from the app would pass the app's mistake.
 *
 * A name is compared as it is SAID: line breaks typed into a label are spaces.
 *
 * Pure.
 */
import type { Connector, DiagramElement } from "../diagram/types";
import { ID_REF_PREFIX, spokenNumbersAsDigits } from "./resolveRef";

/** The ops whose `ref` may name a connector by its label (applyAssistOps.ts). */
export const CONNECTOR_NAMING_OPS: ReadonlySet<string> = new Set(["rename", "delete"]);

/** Whether this op's field may name a connector — the scorers resolve it as the app does. */
export function mayNameConnector(op: string, field: string): boolean {
  return field === "ref" && CONNECTOR_NAMING_OPS.has(op);
}

/** How a scorer records "this ref named a connector" among element ids. */
export const CONNECTOR_REF_PREFIX = "connector:";

/** A label as it is said: line breaks and runs of spaces as one space, lower case. */
export function spokenLabel(s: string | null | undefined): string {
  // Numbers are compared as digits, both sides — "rename message six to …"
  // could not find the message labelled "message 6" (Paul, 2026-09-27). The
  // element resolver has always folded "lane two" into "Lane 2" this way.
  return spokenNumbersAsDigits((s ?? "").replace(/\s+/g, " ").trim().toLowerCase());
}

const QUOTES = /^["'“”‘’]+|["'“”‘’]+$/g;

/**
 * A spoken connector/message reference without its leading
 * "connector/message/msg/flow/arrow" noun and surrounding quotes.
 */
export function messageLabelKey(ref: string): string {
  return spokenLabel(ref
    .trim()
    .replace(/^(?:the\s+)?(?:connector|connexion|connection|message|msg|flow|arrow|link)\s+/i, "")
    .replace(QUOTES, ""));
}

/**
 * Every connector whose label is exactly what was said — whole, or after its
 * noun. A picked one comes back as an `#id:` reference (disambiguate.ts) and
 * names exactly that connector.
 */
export function connectorsNamed(connectors: readonly Connector[], spoken: string): Connector[] {
  if (spoken.startsWith(ID_REF_PREFIX)) {
    const id = spoken.slice(ID_REF_PREFIX.length);
    return connectors.filter((c) => c.id === id);
  }
  const whole = spokenLabel(spoken.replace(QUOTES, ""));
  const byWhole = whole ? connectors.filter((c) => spokenLabel(c.label) === whole) : [];
  if (byWhole.length) return byWhole;
  const key = messageLabelKey(spoken);
  return key ? connectors.filter((c) => spokenLabel(c.label) === key) : [];
}

/**
 * THE RULE: the connectors this names, unless `element` — what the element
 * resolver found for the same words, if anything — is named exactly that.
 *
 * MORE THAN ONE IS A QUESTION, never the first found (Paul, 2026-09-27): his
 * test diagram has three “Yes” and three “No” flows, and "delete connector Yes"
 * deleted whichever came first in the file. The caller numbers them and asks.
 */
export function connectorsOverElement(
  connectors: readonly Connector[],
  spoken: string,
  element: DiagramElement | null | undefined,
): Connector[] {
  const hits = connectorsNamed(connectors, spoken);
  if (!hits.length) return [];
  if (element && spokenLabel(element.label) === spokenLabel(spoken.replace(QUOTES, ""))) return [];
  return hits;
}

/** The rule as a scorer reads it: one connector, several (a question), or none. */
export function connectorResolution(
  connectors: readonly Connector[],
  spoken: string,
  element: DiagramElement | null | undefined,
): { id: string } | { ambiguous: string[] } | null {
  const hits = connectorsOverElement(connectors, spoken, element);
  if (!hits.length) return null;
  return hits.length === 1
    ? { id: `${CONNECTOR_REF_PREFIX}${hits[0].id}` }
    : { ambiguous: hits.map((c) => `${CONNECTOR_REF_PREFIX}${c.id}`) };
}
