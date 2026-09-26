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
  return (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();
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

/** The connector whose label is exactly what was said — whole, or after its noun. */
export function connectorNamed(connectors: readonly Connector[], spoken: string): Connector | undefined {
  const whole = spokenLabel(spoken.replace(QUOTES, ""));
  const key = messageLabelKey(spoken);
  return (whole ? connectors.find((c) => spokenLabel(c.label) === whole) : undefined)
    ?? (key ? connectors.find((c) => spokenLabel(c.label) === key) : undefined);
}

/**
 * THE RULE: the connector this names, unless `element` — what the element
 * resolver found for the same words, if anything — is named exactly that.
 */
export function connectorOverElement(
  connectors: readonly Connector[],
  spoken: string,
  element: DiagramElement | null | undefined,
): Connector | undefined {
  const conn = connectorNamed(connectors, spoken);
  if (!conn) return undefined;
  if (element && spokenLabel(element.label) === spokenLabel(spoken.replace(QUOTES, ""))) return undefined;
  return conn;
}
