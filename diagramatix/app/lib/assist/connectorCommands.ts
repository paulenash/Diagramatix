/**
 * Voice commands that act on CONNECTORS — one place for what they mean, used by
 * the grammar's siblings, the confirmation question and the apply layer alike
 * (a rule in two places goes stale in one).
 *
 *   "delete this"                 a connector is selected → that connector goes
 *   "delete the selected message" — the same, said with the noun
 *   "delete connectors" / "remove messages"
 *        a connector selected → it; elements selected → every connector (or
 *        message) attached to them; nothing selected → EVERY one in the diagram
 *   "reverse this"                 a connector selected → its direction flips
 *
 * Paul, 2026-09-29.
 */
import type { Connector } from "@/app/lib/diagram/types";

/** What a plural delete is about: any connector, or messages only. */
export type ConnectorKind = "connector" | "message";

const NOUNS = "connector|connection|link|arrow|line|flow|sequence flow|message|message flow";

/** The plural-noun sentence: "delete (all) connectors", "remove the messages" — null when it is not one. */
export function parseConnectorsDelete(sentence: string): { kind: ConnectorKind } | null {
  const m = sentence.trim().replace(/[.?!]+$/, "").match(
    /^(?:delete|remove|get rid of|erase|drop)\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:all\s+)?(?:every\s+)?(?:selected\s+)?(connectors|connections|links|arrows|lines|flows|sequence flows|messages|message flows)$/i,
  );
  if (!m) return null;
  return { kind: /message/i.test(m[1]) ? "message" : "connector" };
}

/**
 * A reference that means "the selected connector": the pronouns ("this", "it",
 * "selected") only when no ELEMENT is selected (else they mean the element, as
 * they always have); with a connector noun ("this message", "the selected
 * connector") always.
 */
export function namesSelectedConnector(ref: string, elementsSelected: boolean): boolean {
  const r = ref.trim().toLowerCase().replace(/[.?!]+$/, "");
  if (new RegExp(`^(?:this|that|the selected|selected|the current|current)\\s+(?:${NOUNS})$`).test(r)) return true;
  if (elementsSelected) return false;
  return /^(?:this|that|it|this one|that one|the selected|selected|the selected one)$/.test(r);
}

const isKind = (c: Connector, kind: ConnectorKind) => kind === "message" ? c.type === "messageBPMN" : c.type !== "review-comment-link";

/**
 * Which connectors a plural delete removes.
 *  - a connector is selected (and no element is): that one — `null` if it is not of the kind said
 *  - elements are selected: the connectors attached to them, of the kind
 *  - nothing selected: every one of the kind
 */
export function connectorsForDelete(
  kind: ConnectorKind,
  connectors: readonly Connector[],
  selectedElementIds: readonly string[],
  selectedConnectorId: string | null,
): { connectors: Connector[]; scope: "selected connector" | "selected elements" | "all" } {
  if (selectedConnectorId && selectedElementIds.length === 0) {
    const c = connectors.find((x) => x.id === selectedConnectorId);
    return { connectors: c && isKind(c, kind) ? [c] : [], scope: "selected connector" };
  }
  if (selectedElementIds.length > 0) {
    const sel = new Set(selectedElementIds);
    return { connectors: connectors.filter((c) => isKind(c, kind) && (sel.has(c.sourceId) || sel.has(c.targetId))), scope: "selected elements" };
  }
  return { connectors: connectors.filter((c) => isKind(c, kind)), scope: "all" };
}

const word = (kind: ConnectorKind, n: number) => (kind === "message" ? "message" : "connector") + (n === 1 ? "" : "s");

/** The question asked before removing more than one: "delete all 12 connectors". */
export function deleteConnectorsQuestion(kind: ConnectorKind, n: number, scope: "selected connector" | "selected elements" | "all"): string {
  return scope === "all"
    ? `delete all ${n} ${word(kind, n)}`
    : `delete the ${n} ${word(kind, n)} attached to the selected elements`;
}

export { word as connectorWord };
