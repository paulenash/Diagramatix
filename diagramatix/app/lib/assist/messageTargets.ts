/**
 * "Add a message" by number.
 *
 * Paul, 2026-09-15 — SUPERSEDED by the 2026-09-25 notes below, kept verbatim
 * because it is where the command came from: a bare "add message" should
 * number every message source or target and wait for "n to m labelled <text>";
 * "add message to selected" should number the valid counterparts of the
 * selection — black-box pools when a task or collapsed subprocess is selected,
 * tasks and collapsed subprocesses when a black-box pool is selected — and wait
 * for "to/from n labelled <text>".
 *
 * Paul, 2026-09-25: "Should allow messages to Receive Intermediate events as
 * well e.g. message 2 arrives" — and: "Also messages should be allowed FROM
 * Intermediate and End events with trigger Send. Add Messages should include
 * them in the numbered list."
 *
 * So the numbers are no longer a list of types kept here. They are whatever
 * the ONE message rule allows (canConnect.ts — whyCantSendMessage,
 * whyCantReceiveMessage, messageFlowRefusal), the rule the mouse drop, the blue
 * drag highlight, the reducer and the Rules Checker use. A second list is how
 * "add message" came to number every task but never "Message 2 Arrives", which
 * the mouse could message all along.
 *
 * The pure rule, NOT the whole of canConnect: canConnect says yes to ANY pair
 * with a review comment in it (the reducer turns that into a review link), so
 * numbering "what canConnect allows" would number the whole diagram as soon as
 * a review comment was on it.
 *
 * Pure: the editor draws the badges and applies the resulting addMessage op.
 */
import type { Connector, DiagramElement } from "../diagram/types";
import { numberTargets, type RenameTarget } from "./renameTargets";
import { getElementPoolId } from "../diagram/poolUtil";
import { whyCantSendMessage, whyCantReceiveMessage, messageFlowRefusal, sameMessageParticipant, messageEndName, type CanConnectOptions } from "../diagram/canConnect";

export type MessagePick =
  | { mode: "pair"; targets: RenameTarget[] }
  | {
      mode: "one"; targets: RenameTarget[]; anchorId: string;
      /** The answers that can work: "to" = the anchor sends, "from" = it
       *  receives. A receive-only anchor is offered "from <n>" only. */
      dirs: { to: boolean; from: boolean };
    };

/** Number candidates in reading order — the shared rule, so the same element
 *  carries the same number whichever flow is asking. */
const numbered = numberTargets;

/** One pool lookup per element, not one walk per pair. */
function poolResolver(els: DiagramElement[]): CanConnectOptions {
  const cache = new Map<string, string | null>();
  return {
    poolIdOf: (el) => {
      if (!cache.has(el.id)) cache.set(el.id, getElementPoolId(el, els));
      return cache.get(el.id) ?? null;
    },
  };
}

/**
 * The badges to draw. `anchorId` = the selected element for "add message to
 * selected"; null/undefined = the bare form. `connectors` = the diagram's, so
 * an event that already faces one way is numbered only that way (the rule's
 * `messageTraffic`). Returns an error string when there is nothing sensible to
 * number.
 */
export function collectMessageTargets(
  elements: readonly DiagramElement[],
  anchorId?: string | null,
  connectors: readonly Connector[] = [],
): MessagePick | { error: string } {
  const els = elements as DiagramElement[];
  const opts: CanConnectOptions = { ...poolResolver(els), connectors };
  // Each end is judged once; a sender × receiver pair then needs only the pair
  // part of the rule. Together that is exactly messageFlowRefusal(s, t) ===
  // null, without re-judging both ends for every pair (618 elements took over
  // a second on the main thread that way).
  const senders = els.filter((e) => whyCantSendMessage(e, els, opts) === null);
  const receivers = els.filter((e) => whyCantReceiveMessage(e, els, opts) === null);
  const legal = (s: DiagramElement, t: DiagramElement) => s.id !== t.id && !sameMessageParticipant(s, t, els, opts);

  if (anchorId) {
    const a = els.find((e) => e.id === anchorId);
    if (!a) return { error: "nothing is selected" };
    const cantSend = whyCantSendMessage(a, els, opts);
    const cantReceive = whyCantReceiveMessage(a, els, opts);
    // Refuse the anchor itself first: an element that can do neither gets the
    // rule's reason, not "nothing to message". An end event's telling reason
    // is why it can't SEND; everything else's is why it can't receive.
    if (cantSend && cantReceive) {
      return { error: `${messageEndName(a)} ${a.type === "end-event" ? cantSend : cantReceive}` };
    }
    const toIds = new Set(cantSend ? [] : receivers.filter((x) => legal(a, x)).map((x) => x.id));
    const fromIds = new Set(cantReceive ? [] : senders.filter((x) => legal(x, a)).map((x) => x.id));
    const others = els.filter((x) => toIds.has(x.id) || fromIds.has(x.id));
    if (!others.length) return { error: `nothing in another pool can exchange a message with ${messageEndName(a)}` };
    return { mode: "one", targets: numbered(others), anchorId, dirs: { to: toIds.size > 0, from: fromIds.size > 0 } };
  }

  const ends = new Set<string>();
  for (const s of senders) {
    for (const t of receivers) {
      if (ends.has(s.id) && ends.has(t.id)) continue;
      if (legal(s, t)) { ends.add(s.id); ends.add(t.id); }
    }
  }
  if (ends.size < 2) return { error: "nothing here can exchange a message — a message runs between two pools" };
  return { mode: "pair", targets: numbered(els.filter((e) => ends.has(e.id))) };
}

const NUM: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", thirteen: "13", fourteen: "14", fifteen: "15", sixteen: "16", seventeen: "17", eighteen: "18", nineteen: "19", twenty: "20" };
const numNorm = (s: string) => s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g, (m) => NUM[m]);
const LABEL = `(?:\\s*,?\\s+(?:labell?ed|called|named|saying|with label|with the label|that says)\\s+(.+))?`;

export type MessageAnswer =
  | { kind: "pair"; from: number; to: number; label?: string }
  | { kind: "one"; dir: "to" | "from"; n: number; label?: string }
  | null;

/** "3 to 7 labelled Order Placed" · "from 3 to 7" · "to 2 labelled X" · "from 2, called Y". */
export function parseMessageAnswer(utterance: string, mode: "pair" | "one"): MessageAnswer {
  const s = numNorm(utterance.trim().toLowerCase().replace(/[.!?;:]+$/g, ""));
  if (mode === "pair") {
    const m = s.match(new RegExp(`^(?:from\\s+)?(?:number\\s+)?(\\d+)\\s+to\\s+(?:number\\s+)?(\\d+)${LABEL}$`));
    if (!m) return null;
    return { kind: "pair", from: parseInt(m[1], 10), to: parseInt(m[2], 10), ...(m[3] ? { label: m[3].trim() } : {}) };
  }
  const m = s.match(new RegExp(`^(to|from)\\s+(?:number\\s+)?(\\d+)${LABEL}$`));
  if (!m) return null;
  return { kind: "one", dir: m[1] as "to" | "from", n: parseInt(m[2], 10), ...(m[3] ? { label: m[3].trim() } : {}) };
}

/**
 * Turn an answer into the two ends — or refuse it, with the rule's reason.
 *
 * Every numbered element can take part in SOME message, but not every pairing
 * of them is legal: "Message 1 Arrives" only receives, so "12 to 1" said with
 * it first must not be drawn (the reducer would refuse it and nothing would
 * say why). A backwards answer is refused, never swapped silently — the badges
 * stay up and the log says the order that would work.
 */
export function resolveMessageAnswer(
  flow: MessagePick,
  answer: NonNullable<MessageAnswer>,
  elements: readonly DiagramElement[],
  connectors: readonly Connector[] = [],
): { fromId: string; toId: string } | { error: string } {
  const els = elements as DiagramElement[];
  const opts: CanConnectOptions = { connectors };
  const byN = (n: number) => flow.targets.find((x) => x.n === n)?.id;
  let fromId: string | undefined, toId: string | undefined;
  let saidBackwards = "";
  if (answer.kind === "pair") {
    fromId = byN(answer.from); toId = byN(answer.to);
    saidBackwards = `say “${answer.to} to ${answer.from}”`;
  } else if (flow.mode === "one") {
    const other = byN(answer.n);
    fromId = answer.dir === "to" ? flow.anchorId : other;
    toId = answer.dir === "to" ? other : flow.anchorId;
    saidBackwards = `say “${answer.dir === "to" ? "from" : "to"} ${answer.n}”`;
  }
  if (!fromId || !toId) return { error: "there’s no badge with that number" };
  const from = els.find((e) => e.id === fromId), to = els.find((e) => e.id === toId);
  if (!from || !to) return { error: "that element is no longer on the diagram" };
  const refusal = messageFlowRefusal(from, to, els, opts);
  if (refusal === null) return { fromId, toId };
  return { error: messageFlowRefusal(to, from, els, opts) === null ? `${refusal} — ${saidBackwards}` : refusal };
}
