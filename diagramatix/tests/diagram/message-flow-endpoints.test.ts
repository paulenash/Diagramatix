/**
 * T4805-T4814 — one message-flow endpoint rule, asked by every path
 * (Block 2 Test 3, 25 September 2026).
 *
 * Paul said "add message" and got "numbers on every task, collapsed
 * subprocess and black-box pool". His verdict: PARTLY — "Should allow messages
 * to Receive Intermediate events as well e.g. message 2 arrives". Later: "Also
 * messages should be allowed FROM Intermediate and End events with trigger
 * Send. Add Messages should include them in the numbered list." And on plain
 * events: "Convertible".
 *
 * The numbered set was a second, hard-coded list; the mouse, the highlight and
 * the reducer each had a copy of the message rule, and none agreed. Now the
 * rule lives in canConnect.ts (whyCantSendMessage / whyCantReceiveMessage /
 * messageFlowRefusal) and the numbering, the answer, the addMessage op, the
 * reducer, the drop, the blue ring and the Rules Checker (B42) all ask it.
 *
 * The recorded diagram is snapshot qe8reyjr of that session, byte for byte
 * (tests/fixtures/block2-test3-add-message.json).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canConnect, messageFlowRefusal, whyCantSendMessage, whyCantReceiveMessage, sameMessageParticipant } from "@/app/lib/diagram/canConnect";
import { isThrowingEvent, isCatchingEvent } from "@/app/lib/diagram/eventDirection";
import { computeDragContext, classifyDragTarget, isMessageHighlightTarget } from "@/app/lib/diagram/connectorHighlight";
import { checkConnectorLegality } from "@/app/lib/diagram/checks/diagramChecks";
import { collectMessageTargets, resolveMessageAnswer, parseMessageAnswer, type MessagePick } from "@/app/lib/assist/messageTargets";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { checkEffect } from "@/app/lib/assist/opEffects";
import { ID_REF_PREFIX } from "@/app/lib/assist/resolveRef";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { reducer } from "@/app/hooks/useDiagram";
import type { Connector, DiagramData, DiagramElement } from "@/app/lib/diagram/types";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
/** Source with comments removed — the wiring is in the code, not the prose about it. */
const code = (...p: string[]) =>
  read(...p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

// ── Paul's diagram ─────────────────────────────────────────────────────────
const PAUL = JSON.parse(read("tests", "fixtures", "block2-test3-add-message.json")) as { elements: DiagramElement[]; connectors: Connector[] };
const paul = (): DiagramData =>
  ({ elements: structuredClone(PAUL.elements), connectors: structuredClone(PAUL.connectors), viewport: { x: 0, y: 0, zoom: 1 } }) as DiagramData;
const flat = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
/** Paul's elements by what he sees on them. The two unnamed events inside the
 *  expanded subprocess are named by id. */
const ID: Record<string, string> = Object.fromEntries(PAUL.elements.filter((e) => flat(e.label)).map((e) => [flat(e.label), e.id]));
const INNER_START = "zsu9oyzy", INNER_END = "053zw5u6";
const GATEWAYS = PAUL.elements.filter((e) => e.type === "gateway").map((e) => e.id);
const LANES = PAUL.elements.filter((e) => e.type === "lane").map((e) => e.id);

// ── A synthetic world for the table: every end in a different pool ─────────
const el = (id: string, type: string, extra: Partial<DiagramElement> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label: id, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });
const PA = el("PA", "pool", { x: 0, y: 0, width: 800, height: 300, properties: { poolType: "white-box" } });
const PB = el("PB", "pool", { x: 0, y: 400, width: 800, height: 300, properties: { poolType: "white-box" } });
const BB = el("BB", "pool", { x: 0, y: 800, width: 800, height: 100, properties: { poolType: "black-box" } });
const BB2 = el("BB2", "pool", { x: 0, y: 1000, width: 800, height: 100, properties: { poolType: "black-box" } });
const inB = (id: string, type: string, extra: Partial<DiagramElement> = {}) => el(id, type, { parentId: "PB", ...extra });
const sender = el("sender", "task", { parentId: "PA" });
const receiver = el("receiver", "task", { parentId: "PA" });
const HOST = inB("host", "task");
const EP = inB("ep", "subprocess-expanded", { width: 300, height: 200 });
const EVT_EP = inB("evtEp", "subprocess-expanded", { width: 300, height: 200, properties: { subprocessType: "event" } });

/** [name, element, can SEND, can RECEIVE] — each checked against a task in another pool. */
const TABLE: Array<[string, DiagramElement, boolean, boolean]> = [
  ["task", inB("t", "task"), true, true],
  ["collapsed subprocess", inB("sp", "subprocess"), true, true],
  ["expanded subprocess", EP, true, true],
  ["black-box pool", BB, true, true],
  ["Message start", inB("ms", "start-event", { eventType: "message" }), false, true],
  ["plain start (convertible)", inB("ps", "start-event"), false, true],
  ["Multiple start", inB("mus", "start-event", { eventType: "multiple" }), false, true],
  ["Message end", inB("me", "end-event", { eventType: "message" }), true, false],
  ["plain end (convertible)", inB("pe", "end-event"), true, false],
  ["Message catch (Flow Type catching)", inB("mc", "intermediate-event", { eventType: "message", flowType: "catching" }), false, true],
  ["Message throw (Flow Type throwing)", inB("mt", "intermediate-event", { eventType: "message", flowType: "throwing" }), true, false],
  ["Message throw, legacy taskType send", inB("ml", "intermediate-event", { eventType: "message", taskType: "send" }), true, false],
  ["Message intermediate, no Flow Type", inB("mu", "intermediate-event", { eventType: "message" }), true, true],
  ["Message intermediate, Flow Type none", inB("mn", "intermediate-event", { eventType: "message", flowType: "none" }), true, true],
  ["plain intermediate (convertible)", inB("pi", "intermediate-event"), true, true],
  ["Parallel-multiple intermediate", inB("pm", "intermediate-event", { eventType: "parallel-multiple" }), true, true],
  ["boundary Message event", inB("bm", "intermediate-event", { boundaryHostId: "host", eventType: "message" }), false, true],
  ["boundary Timer event", inB("bt", "intermediate-event", { boundaryHostId: "host", eventType: "timer" }), false, false],
  ["boundary Error event", inB("be", "intermediate-event", { boundaryHostId: "host", eventType: "error" }), false, false],
  ["boundary Escalation event", inB("bx", "intermediate-event", { boundaryHostId: "host", eventType: "escalation" }), false, false],
  ["inline Timer event", inB("it", "intermediate-event", { eventType: "timer" }), false, false],
  ["inline Error end", inB("ie", "end-event", { eventType: "error" }), false, false],
  ["inline Escalation event", inB("ix", "intermediate-event", { eventType: "escalation", flowType: "throwing" }), false, false],
  ["Timer start", inB("ts", "start-event", { eventType: "timer" }), false, false],
  ["boundary start on an EP", inB("bs", "start-event", { boundaryHostId: "ep" }), false, false],
  ["boundary end on an EP", inB("bn", "end-event", { boundaryHostId: "ep", eventType: "message" }), false, false],
  ["start inside an embedded subprocess", el("es", "start-event", { parentId: "ep", x: 50, y: 450 }), false, false],
  ["Message start inside an event subprocess", el("vs", "start-event", { parentId: "evtEp", x: 50, y: 450, eventType: "message" }), false, true],
  ["event subprocess shell", EVT_EP, false, false],
  ["compensation activity", inB("ca", "task", { properties: { isForCompensation: true } }), false, false],
  ["gateway", inB("g", "gateway"), false, false],
  ["lane", inB("l", "lane"), false, false],
  ["white-box pool", PB, false, false],
  ["data object", inB("d", "data-object"), false, false],
  ["data store", inB("ds", "data-store"), false, false],
  ["text annotation", inB("a", "text-annotation"), false, false],
  ["a task inside a black-box pool", el("hidden", "task", { parentId: "BB2" }), false, false],
];
const WORLD = [PA, PB, BB, BB2, sender, receiver, HOST, ...TABLE.map(([, e]) => e)]
  .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);

describe("T4805 — the rule, end by end: canConnect(messageBPMN) with every end in a different pool", () => {
  for (const [name, e, sends, receives] of TABLE) {
    it(`${name}: ${sends ? "sends" : "never sends"}, ${receives ? "receives" : "never receives"}`, () => {
      expect(canConnect(e, receiver, "messageBPMN", WORLD), `${name} → a task in another pool`).toBe(sends);
      expect(canConnect(sender, e, "messageBPMN", WORLD), `a task in another pool → ${name}`).toBe(receives);
      // canConnect's message branch IS the rule — same answer, and a reason whenever it refuses.
      expect(messageFlowRefusal(e, receiver, WORLD) === null).toBe(sends);
      expect(messageFlowRefusal(sender, e, WORLD) === null).toBe(receives);
      if (!sends) expect(whyCantSendMessage(e, WORLD) ?? messageFlowRefusal(e, receiver, WORLD)).toMatch(/\S.{12,}/);
      if (!receives) expect(whyCantReceiveMessage(e, WORLD) ?? messageFlowRefusal(sender, e, WORLD)).toMatch(/\S.{12,}/);
    });
  }

  it("the reasons read as sentences that name the end at fault", () => {
    const m1a = PAUL.elements.find((e) => e.id === ID["Message 1 Arrives"])!;
    const cust = PAUL.elements.find((e) => e.id === ID["Customer"])!;
    const els = PAUL.elements;
    expect(messageFlowRefusal(m1a, cust, els)).toBe("“Message 1 Arrives” catches a message — it can only receive one");
    expect(messageFlowRefusal(cust, els.find((e) => e.id === ID["Timeout"])!, els)).toMatch(/^“Timeout” has a Timer trigger — only a Message event/);
    expect(messageFlowRefusal(cust, els.find((e) => e.id === ID["Is it in stock?"])!, els)).toMatch(/^“Is it in stock\?” is a gateway — /);
    expect(messageFlowRefusal(els.find((e) => e.id === ID["Receive order"])!, els.find((e) => e.id === ID["Pick items"])!, els))
      .toBe("“Receive order” and “Pick items” are in the same pool — join them with a sequence flow, not a message");
    expect(messageFlowRefusal(cust, els.find((e) => e.id === INNER_START)!, els))
      .toBe("the unnamed start event starts an embedded subprocess — that always begins with a plain (None) start event");
  });
});

describe("T4806 — the pair: two different participants", () => {
  const floatA = el("floatA", "task", { x: 5000, y: 5000 });
  const floatB = el("floatB", "task", { x: 5200, y: 5000 });
  const inPA = el("inPA", "task", { parentId: "PA" });
  const inPB = el("inPB", "task", { parentId: "PB" });
  const w = [PA, PB, BB, BB2, floatA, floatB, inPA, inPB];

  it("different pools may exchange a message; the same pool may not", () => {
    expect(canConnect(inPA, inPB, "messageBPMN", w)).toBe(true);
    expect(canConnect(inPA, el("inPA2", "task", { parentId: "PA" }), "messageBPMN", [...w, el("inPA2", "task", { parentId: "PA" })])).toBe(false);
  });
  it("a black-box pool messages another black-box pool, but never an element of its own", () => {
    expect(canConnect(BB, BB2, "messageBPMN", w)).toBe(true);
    const own = el("own", "task", { parentId: "BB" });
    expect(canConnect(BB, own, "messageBPMN", [...w, own]), "its own (hidden) contents").toBe(false);
  });
  it("a pool-less element is its own participant only against something in a pool — the highlight's invisible pool", () => {
    expect(canConnect(floatA, inPB, "messageBPMN", w), "floating → pooled").toBe(true);
    expect(canConnect(BB, floatA, "messageBPMN", w), "black-box pool → floating").toBe(true);
    expect(canConnect(floatA, floatB, "messageBPMN", w), "floating → floating: one invisible pool").toBe(false);
    expect(messageFlowRefusal(floatA, floatB, w)).toBe("“floatA” and “floatB” are both outside every pool — a message runs between two pools");
  });
  it("only an EXPLICIT black-box pool hides its contents (an untyped pool is ambiguous)", () => {
    const untyped = el("untyped", "pool", { x: 0, y: 2000, width: 800, height: 200 });
    const inside = el("inside", "task", { parentId: "untyped", x: 50, y: 2050 });
    expect(canConnect(inPA, inside, "messageBPMN", [...w, untyped, inside])).toBe(true);
  });
  it("a precomputed pool resolver gives the same answers as the walk", () => {
    const poolIdOf = (e: DiagramElement) => (e.type === "pool" ? e.id : e.parentId === "PA" || e.parentId === "PB" || e.parentId === "BB" ? e.parentId : null);
    for (const s of w) for (const t of w) {
      expect(canConnect(s, t, "messageBPMN", w, { poolIdOf }), `${s.id} → ${t.id}`).toBe(canConnect(s, t, "messageBPMN", w));
    }
  });
});

describe("T4807 — direction is what the canvas draws, and a plain event converts (Paul: “Convertible”)", () => {
  it("isThrowingEvent is SymbolRenderer's reading; only an explicit catching fixes a receiver", () => {
    expect(isThrowingEvent({ flowType: "throwing" })).toBe(true);
    expect(isThrowingEvent({ taskType: "send" }), "legacy send, no Flow Type").toBe(true);
    expect(isThrowingEvent({ flowType: "catching", taskType: "send" }), "an explicit Flow Type wins").toBe(false);
    expect(isThrowingEvent({ flowType: "none", taskType: "send" })).toBe(false);
    expect(isThrowingEvent({})).toBe(false);
    expect(isCatchingEvent({ flowType: "catching" })).toBe(true);
    expect(isCatchingEvent({})).toBe(false);
  });

  const world = (...els: DiagramElement[]) => ({ elements: [PA, PB, ...els], connectors: [], viewport: { x: 0, y: 0, zoom: 1 } }) as DiagramData;
  const msg = (d: DiagramData, s: string, t: string) => reducer(d, {
    type: "ADD_CONNECTOR",
    payload: { sourceId: s, targetId: t, connectorType: "messageBPMN", directionType: "directed", routingType: "direct", sourceSide: "bottom", targetSide: "top" },
  } as never);
  const find = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

  it("a plain start becomes a Message start; a plain end a Message end; a plain intermediate faces the message", () => {
    const t = el("t", "task", { parentId: "PA" });
    const out1 = msg(world(t, inB("s", "start-event")), "t", "s");
    expect(out1.connectors).toHaveLength(1);
    expect(find(out1, "s")).toMatchObject({ eventType: "message", flowType: "catching" });
    const out2 = msg(world(t, inB("e", "end-event")), "e", "t");
    expect(find(out2, "e")).toMatchObject({ eventType: "message", flowType: "throwing" });
    const out3 = msg(world(t, inB("i", "intermediate-event")), "i", "t");
    expect(find(out3, "i")).toMatchObject({ eventType: "message", flowType: "throwing" });
    expect(isThrowingEvent(find(out3, "i"))).toBe(true);
  });

  it("a Message event with no Flow Type goes either way and takes the direction it was used in", () => {
    const t = el("t", "task", { parentId: "PA" });
    const out = msg(world(t, inB("m", "intermediate-event", { eventType: "message" })), "m", "t");
    expect(out.connectors).toHaveLength(1);
    expect(find(out, "m").flowType).toBe("throwing");
  });

  it("a Multiple trigger carries the message and keeps its own marker", () => {
    const t = el("t", "task", { parentId: "PA" });
    const out = msg(world(t, inB("mu", "start-event", { eventType: "multiple" })), "t", "mu");
    expect(out.connectors).toHaveLength(1);
    expect(find(out, "mu").eventType).toBe("multiple");
  });

  it("a Timer is refused and stays a Timer; a catching Message event is refused as a sender and stays a catch", () => {
    const t = el("t", "task", { parentId: "PA" });
    const out = msg(world(t, inB("tm", "intermediate-event", { eventType: "timer" })), "t", "tm");
    expect(out.connectors).toHaveLength(0);
    expect(find(out, "tm").eventType).toBe("timer");
    const out2 = msg(world(t, inB("c", "intermediate-event", { eventType: "message", flowType: "catching" })), "c", "t");
    expect(out2.connectors).toHaveLength(0);
    expect(find(out2, "c").flowType).toBe("catching");
  });
});

describe("T4808 — “add message” on Paul's diagram numbers what the rule allows", () => {
  const pick = collectMessageTargets(PAUL.elements, null, PAUL.connectors);
  const ids = () => new Set(("targets" in pick ? pick.targets : []).map((t) => t.id));

  it("numbers both message events and the expanded subprocess — what his note asked for", () => {
    expect("error" in pick, JSON.stringify(pick).slice(0, 200)).toBe(false);
    for (const name of ["Message 1 Arrives", "Message 2 Arrives", "Repeat until Re-Work Completed", "Customer", "SalesForce", "Receive order", "Do nothing"]) {
      expect(ids().has(ID[name]), name).toBe(true);
    }
  });

  it("numbers the plain Start, End and Rejected (convertible) and the subprocess's inner end", () => {
    for (const name of ["Start", "End", "Rejected"]) expect(ids().has(ID[name]), name).toBe(true);
    expect(ids().has(INNER_END)).toBe(true);
  });

  it("never numbers the timer, Event 4, a gateway, a lane, the white-box pool, the data object or the embedded start", () => {
    for (const id of [ID["Timeout"], ID["Event 4"], ID["My company"], ID["Data 1"], INNER_START, ...GATEWAYS, ...LANES]) {
      expect(ids().has(id), flat(PAUL.elements.find((e) => e.id === id)?.label) || id).toBe(false);
    }
    expect(ids().size).toBe(20);
  });

  it("there is no second list: the numbers are exactly the ends of some legal message, by the rule itself", () => {
    const els = PAUL.elements;
    const byRule = new Set<string>();
    for (const s of els) for (const t of els) {
      if (s.id !== t.id && messageFlowRefusal(s, t, els, { connectors: PAUL.connectors }) === null) { byRule.add(s.id); byRule.add(t.id); }
    }
    expect(ids()).toEqual(byRule);
  });

  it("a review comment on the diagram changes nothing — and cannot anchor a message", () => {
    const note = el("rc", "review-comment", { x: 400, y: -400, label: "Check this" });
    const withNote = [...PAUL.elements, note];
    const again = collectMessageTargets(withNote, null, PAUL.connectors);
    expect("targets" in again && new Set(again.targets.map((t) => t.id))).toEqual(ids());
    expect(collectMessageTargets(withNote, "rc", PAUL.connectors)).toEqual({ error: "“Check this” is a review comment — only tasks, subprocesses, black-box pools and events exchange messages" });
  });

  it("the reminder card and the docs no longer promise only tasks, collapsed subprocesses and pools", () => {
    const card = COMMAND_CATALOG.find((f) => f.family === "Messages")!.items.map((i) => i.does).join("\n");
    expect(card).not.toMatch(/collapsed subprocesses and black-box pools/);
    expect(card).toMatch(/everything a message can start or end at/);
    expect(read("docs", "voice-assist-commands.md")).not.toMatch(/every task, collapsed subprocess and\s+black-box pool/);
    expect(read("scripts", "sql", "seed-voice-assist-content.sql")).not.toMatch(/numbers every task, collapsed subprocess and black-box pool/);
  });
});

describe("T4809 — the selected form, and an answer said backwards", () => {
  const one = (name: string) => collectMessageTargets(PAUL.elements, ID[name] ?? name, PAUL.connectors) as MessagePick & { mode: "one" };
  const nOf = (p: MessagePick, id: string) => p.targets.find((t) => t.id === id)!.n;

  it("Customer selected: every counterpart, the message events among them", () => {
    const p = one("Customer");
    const got = new Set(p.targets.map((t) => t.id));
    expect(got.has(ID["Message 1 Arrives"])).toBe(true);
    expect(got.has(ID["Message 2 Arrives"])).toBe(true);
    expect(got.has(ID["SalesForce"]), "pool to pool").toBe(true);
    expect(got.size).toBe(19);
    expect(p.dirs).toEqual({ to: true, from: true });
  });

  it("Message 2 Arrives selected: only the two pools, either way (no Flow Type)", () => {
    const p = one("Message 2 Arrives");
    expect(new Set(p.targets.map((t) => t.id))).toEqual(new Set([ID["Customer"], ID["SalesForce"]]));
    expect(p.dirs).toEqual({ to: true, from: true });
  });

  it("Message 1 Arrives (catching) selected: offered “from” only", () => {
    const p = one("Message 1 Arrives");
    expect(new Set(p.targets.map((t) => t.id))).toEqual(new Set([ID["Customer"], ID["SalesForce"]]));
    expect(p.dirs).toEqual({ to: false, from: true });
    expect(one("Start").dirs).toEqual({ to: false, from: true });
    expect(one("End").dirs).toEqual({ to: true, from: false });
  });

  it("an anchor the rule refuses outright gets the rule's reason", () => {
    expect(one("Timeout")).toEqual({ error: expect.stringMatching(/^“Timeout” has a Timer trigger/) });
    expect(one("Is it in stock?")).toEqual({ error: expect.stringMatching(/is a gateway/) });
    expect(one("My company")).toEqual({ error: expect.stringMatching(/is a white-box pool/) });
    expect(collectMessageTargets(PAUL.elements, INNER_START, PAUL.connectors)).toEqual({ error: expect.stringMatching(/starts an embedded subprocess/) });
    expect(one("Event 4")).toEqual({ error: expect.stringMatching(/boundary event without a Message trigger/) });
  });

  it("resolveMessageAnswer: “from n” accepted, “to n” refused with the reason and the order that works", () => {
    const p = one("Message 1 Arrives");
    const c = nOf(p, ID["Customer"]);
    expect(resolveMessageAnswer(p, parseMessageAnswer(`from ${c}`, "one")!, PAUL.elements, PAUL.connectors))
      .toEqual({ fromId: ID["Customer"], toId: ID["Message 1 Arrives"] });
    expect(resolveMessageAnswer(p, parseMessageAnswer(`to ${c} labelled hi`, "one")!, PAUL.elements, PAUL.connectors))
      .toEqual({ error: `“Message 1 Arrives” catches a message — it can only receive one — say “from ${c}”` });
  });

  it("pair mode: the receive-only end said first is refused; said second it is accepted; no badge is no badge", () => {
    const p = collectMessageTargets(PAUL.elements, null, PAUL.connectors) as MessagePick;
    const m1 = nOf(p, ID["Message 1 Arrives"]), cu = nOf(p, ID["Customer"]);
    expect(resolveMessageAnswer(p, parseMessageAnswer(`${m1} to ${cu}`, "pair")!, PAUL.elements, PAUL.connectors))
      .toEqual({ error: `“Message 1 Arrives” catches a message — it can only receive one — say “${cu} to ${m1}”` });
    expect(resolveMessageAnswer(p, parseMessageAnswer(`${cu} to ${m1}`, "pair")!, PAUL.elements, PAUL.connectors))
      .toEqual({ fromId: ID["Customer"], toId: ID["Message 1 Arrives"] });
    // Two numbered ends that can't pair either way: no "say it the other way".
    const ro = nOf(p, ID["Receive order"]), pi = nOf(p, ID["Pick items"]);
    expect(resolveMessageAnswer(p, parseMessageAnswer(`${ro} to ${pi}`, "pair")!, PAUL.elements, PAUL.connectors))
      .toEqual({ error: "“Receive order” and “Pick items” are in the same pool — join them with a sequence flow, not a message" });
    expect(resolveMessageAnswer(p, parseMessageAnswer("99 to 1", "pair")!, PAUL.elements, PAUL.connectors)).toEqual({ error: "there’s no badge with that number" });
  });
});

describe("T4810 — headless, the apply layer asks the same rule (L4)", () => {
  const add = (from: string, to: string, label?: string) => {
    const h = headlessDiagram(paul());
    const before = h.data;
    const op = { op: "addMessage" as const, fromRef: ID_REF_PREFIX + from, toRef: ID_REF_PREFIX + to, ...(label ? { label } : {}) };
    const r = applyAssistOps([op], h.context());
    const added = h.data.connectors.filter((c) => !before.connectors.some((b) => b.id === c.id));
    return { ...r, added, before, after: h.data, op };
  };
  const find = (d: DiagramData, id: string) => d.elements.find((e) => e.id === id)!;

  it("“5 to 6” in one pool is refused and nothing is drawn", () => {
    const r = add(ID["Receive order"], ID["Pick items"]);
    expect(r.ok).toBe(false);
    expect(r.added).toHaveLength(0);
    expect(r.summary).toMatch(/same pool/);
    expect(r.summary).not.toMatch(/added message/);
  });

  it("SalesForce → Timeout is refused and Timeout stays a timer", () => {
    const r = add(ID["SalesForce"], ID["Timeout"]);
    expect(r.ok).toBe(false);
    expect(r.added).toHaveLength(0);
    expect(find(r.after, ID["Timeout"]).eventType).toBe("timer");
  });

  it("Message 1 Arrives → SalesForce is refused and it stays a catch", () => {
    const r = add(ID["Message 1 Arrives"], ID["SalesForce"]);
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/catches a message — it can only receive one/);
    const m1 = find(r.after, ID["Message 1 Arrives"]);
    expect(m1.flowType).toBe("catching");
    expect(isThrowingEvent(m1)).toBe(false);
  });

  it("Customer → a gateway is refused", () => {
    const r = add(ID["Customer"], ID["Is it in stock?"]);
    expect(r.ok).toBe(false);
    expect(r.added).toHaveLength(0);
  });

  it("Customer → Message 2 Arrives is added, and the L4 effect check passes", () => {
    const r = add(ID["Customer"], ID["Message 2 Arrives"], "Order changed");
    expect(r.ok, r.summary).toBe(true);
    expect(r.added).toHaveLength(1);
    expect(checkEffect(r.op, r.before, r.after, { fromRef: ID["Customer"], toRef: ID["Message 2 Arrives"] })).toEqual({ ok: true, detail: "" });
    expect(find(r.after, ID["Message 2 Arrives"]).flowType).toBe("catching");
  });

  it("Customer → the plain Start is added and Start becomes a Message start (convertible)", () => {
    const r = add(ID["Customer"], ID["Start"]);
    expect(r.ok, r.summary).toBe(true);
    expect(find(r.after, ID["Start"])).toMatchObject({ eventType: "message", flowType: "catching" });
  });

  it("the prompt offers only the answer that can work", () => {
    const h = headlessDiagram(paul());
    const r = applyAssistOps([{ op: "addMessageByNumber", fromSelection: true }], h.context({ selectedIds: [ID["Message 1 Arrives"]] }));
    expect(r.ok).toBe(true);
    expect(h.screen).toEqual(["message"]);
    expect(r.summary).toBe("numbers on what can exchange a message with Message 1\nArrives — say “from <n> labelled <text>” (or “done”)");
    const bare = applyAssistOps([{ op: "addMessageByNumber" }], headlessDiagram(paul()).context());
    expect(bare.summary).toBe("numbers on everything a message can start or end at — say “<n> to <m> labelled <text>” (or “done”)");
    const none = applyAssistOps([{ op: "addMessageByNumber", fromSelection: true }], headlessDiagram(paul()).context());
    expect(none).toEqual({ ok: false, summary: "select what the message starts or ends at first" });
  });
});

describe("T4811 — the blue ring is the rule", () => {
  const els = PAUL.elements;
  const blue = (s: DiagramElement, t: DiagramElement, world = els, conns = PAUL.connectors) =>
    classifyDragTarget(s, t, computeDragContext(s, world, conns, s.id), world, conns, "bpmn").message;

  it("on Paul's diagram, blue equals the rule for every source and every target", () => {
    const diffs: string[] = [];
    for (const s of els) for (const t of els) {
      const want = s.id !== t.id && messageFlowRefusal(s, t, els, { connectors: PAUL.connectors }) === null;
      if (blue(s, t) !== want) diffs.push(`${flat(s.label) || s.id} → ${flat(t.label) || t.id}: blue ${!want}`);
    }
    expect(diffs).toEqual([]);
  });

  it("the cases Paul would notice", () => {
    const e = (n: string) => els.find((x) => x.id === (ID[n] ?? n))!;
    expect(blue(e("Customer"), e("Message 1 Arrives")), "a Message catch event").toBe(true);
    expect(blue(e("Customer"), e("Message 2 Arrives"))).toBe(true);
    expect(blue(e("Customer"), e("Start")), "a plain start converts").toBe(true);
    expect(blue(e("Customer"), e("Timeout")), "a timer").toBe(false);
    expect(blue(e("Customer"), e("Is it in stock?")), "a gateway").toBe(false);
    expect(blue(e("Timeout"), e("Customer"))).toBe(false);
    expect(blue(e("Is it in stock?"), e("Customer"))).toBe(false);
    expect(blue(e("Start"), e("Customer")), "a start event never sends").toBe(false);
    for (const t of els) expect(blue(e("My company"), t), `white-box pool → ${t.id}`).toBe(false);
    // A task that already SENDS a message is still a target — the old send-lock is gone.
    expect(blue(e("Customer"), e("Do nothing"))).toBe(true);
    expect(blue(e("SalesForce"), e("Receive order"))).toBe(true);
  });

  it("a review comment never lights blue, either end", () => {
    const note = el("rc", "review-comment", { x: 400, y: -400 });
    const world = [...els, note];
    for (const t of els) {
      expect(blue(note, t, world), `note → ${t.id}`).toBe(false);
      expect(blue(t, note, world), `${t.id} → note`).toBe(false);
    }
    expect(isMessageHighlightTarget(note, els[0], world)).toBe(false);
  });
});

describe("T4812 — the Rules Checker (B42) under the one rule", () => {
  const conn = (id: string, s: string, t: string, type = "messageBPMN"): Connector =>
    ({ id, type, sourceId: s, targetId: t, waypoints: [] } as unknown as Connector);

  it("flags a pool → gateway message and a same-pool message; passes a message to a plain start", () => {
    const g = inB("g", "gateway"), a = inB("a", "task"), b = inB("b", "task"), s = inB("s", "start-event");
    const data = { elements: [PB, BB, g, a, b, s], connectors: [conn("toGw", "BB", "g"), conn("same", "a", "b"), conn("toStart", "BB", "s")] };
    const flagged = new Set(checkConnectorLegality(data).map((v) => v.ids[0]));
    expect(flagged.has("toGw")).toBe(true);
    expect(flagged.has("same")).toBe(true);
    expect(flagged.has("toStart"), "convertible: a plain start receives").toBe(false);
  });

  it("Paul's diagram: none of its eight messages is flagged", () => {
    const msgs = new Set(PAUL.connectors.filter((c) => c.type === "messageBPMN").map((c) => c.id));
    expect(msgs.size).toBe(8);
    expect(checkConnectorLegality(PAUL).filter((v) => msgs.has(v.ids[0]))).toEqual([]);
  });

  it("the seeded Order-to-Cash example: no message flow in any of its diagrams is flagged", () => {
    const pkg = JSON.parse(read("app", "lib", "riskControls", "o2cProjectExport.json")) as { diagrams: Array<{ name: string; data: { elements: DiagramElement[]; connectors: Connector[] } }> };
    let checked = 0;
    for (const d of pkg.diagrams) {
      const msgs = new Set((d.data.connectors ?? []).filter((c) => c.type === "messageBPMN").map((c) => c.id));
      checked += msgs.size;
      expect(checkConnectorLegality(d.data).filter((v) => msgs.has(v.ids[0])).map((v) => v.message), d.name).toEqual([]);
    }
    expect(checked, "the example carries messages to check").toBeGreaterThan(40);
  });
});

describe("T4813 — wiring: every path asks the one rule", () => {
  it("the reducer's ADD_CONNECTOR asks messageFlowRefusal and keeps no copy of its own", () => {
    const src = code("app", "hooks", "useDiagram.ts");
    const start = src.indexOf('case "ADD_CONNECTOR": {');
    const body = src.slice(start, src.indexOf('case "DELETE_CONNECTOR": {', start));
    expect(body).toContain('if (connectorType === "messageBPMN" && messageFlowRefusal(source, target, state.elements, { connectors: state.connectors }) !== null) return state;');
    expect(body).not.toMatch(/isBoundaryIntermediate|srcIsWhiteBoxPool|tgtIsWhiteBoxPool/);
  });

  it("canConnect's message branch is the rule and nothing else", () => {
    const src = code("app", "lib", "diagram", "canConnect.ts");
    expect(src).toContain('if (connectorType === "messageBPMN" && messageFlowRefusal(source, target, elements, opts) !== null) return false;');
    expect(src.match(/connectorType === "messageBPMN"/g)).toHaveLength(1);
  });

  it("the numbering has no list of its own", () => {
    const src = code("app", "lib", "assist", "messageTargets.ts");
    expect(src).toMatch(/from "\.\.\/diagram\/canConnect"/);
    expect(src).not.toMatch(/ACTIVITY_TYPES|isMessageActivity|isBlackBoxPool|new Set<string>\(\["task"/);
  });

  it("the Canvas drop has no inline message rule, and a floating source crosses to a pool", () => {
    const src = code("app", "components", "canvas", "Canvas.tsx");
    expect(src).not.toMatch(/sourceEl\?\.type === "start-event"\) return;/);
    expect(src).not.toMatch(/targetEl\.type === "pool" && targetPoolId === sourcePoolId\) return;/);
    expect(src).toMatch(/\|\| \(diagramType === "bpmn" && !!sourceEl && !touchesReviewComment && sourcePoolId !== targetPoolId\)/);
    expect(src).toContain('!canConnect(sourceEl, targetEl, "messageBPMN", data.elements, { connectors: data.connectors })');
  });

  it("the highlight gates blue on the rule and has no send-lock", () => {
    const src = code("app", "lib", "diagram", "connectorHighlight.ts");
    expect(src).not.toMatch(/SendLocked/);
    expect(src).toContain("isMessageHighlightTarget(source, target, elements, { poolIdOf: poolOf, connectors })");
    expect(src).toContain("isThrowingEvent(source)");
    expect(code("app", "components", "canvas", "SymbolRenderer.tsx")).toContain("filled={isThrowingEvent(el)}");
  });

  it("addMessage asks the message rule before it draws; the editor keeps the numbers up on a refused answer", () => {
    const apply = code("app", "lib", "assist", "applyAssistOps.ts");
    const body = apply.slice(apply.indexOf('if (op.op === "addMessage") {'));
    const gate = body.indexOf("const whyNot = messageFlowRefusal(f, t, els, { connectors: data.connectors });");
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(body.indexOf("addConnector("));
    const ed = code("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
    const h = ed.slice(ed.indexOf("const handleMessageUtterance"), ed.indexOf("const handleMessageUtteranceRef"));
    expect(h).toContain("resolveMessageAnswer(flow, a, elementsRef.current, connectorsRef.current)");
    const refuse = h.indexOf('if ("error" in ends) { log(ends.error, false); return; }');
    expect(refuse).toBeGreaterThan(-1);
    expect(refuse, "the refusal returns before the flow is closed").toBeLessThan(h.lastIndexOf("setMessageFlow(null);"));
    // An answer that doesn't parse is re-prompted with only the forms that can work.
    expect(h).toContain('flow.dirs.to ? "“to <n> labelled <text>”" : ""');
    expect(h).toContain('flow.dirs.from ? "“from <n> labelled <text>”" : ""');
  });
});

describe("T4814 — the live User Guide patch", () => {
  const patch = read("scripts", "sql", "patch-voice-assist-message-numbering.sql");
  const seed = read("scripts", "sql", "seed-voice-assist-content.sql");
  const between = (tag: string) => patch.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`))![1];

  it("writes exactly the line the seed now carries, in place of the line it used to", () => {
    expect(seed).toContain(between("NEW"));
    expect(seed).not.toContain(between("OLD"));
    // The line as the seed put it into the live guide on 2026-09-20 (D1),
    // through the patch's replace(), is the seed's line now, character for character.
    const seeded = "- **\"add a message\"** with no ends numbers every task, collapsed subprocess and black-box pool. Say **\"3 to 7 labelled Order Placed\"**.";
    const patched = seeded.split(between("OLD")).join(between("NEW"));
    expect(patched).not.toBe(seeded);
    expect(seed.split(/\r?\n/)).toContain(patched);
  });

  it("is idempotent: its guard matches the old line and not the new one", () => {
    const guard = patch.match(/"bodyMarkdown" LIKE '%([^%']+)%';/)![1];
    expect(between("OLD")).toContain(guard);
    expect(between("NEW")).not.toContain(guard);
  });

  it("is one transaction, with its verification AFTER the commit", () => {
    expect(patch.indexOf("BEGIN;")).toBeGreaterThan(-1);
    expect(patch.indexOf("COMMIT;")).toBeGreaterThan(patch.indexOf("UPDATE \"HelpSection\""));
    expect(patch.slice(patch.indexOf("COMMIT;"))).toMatch(/\bSELECT\b/);
  });
});

// ── An event already facing one way ────────────────────────────────────────
const VIEW = { x: 0, y: 0, zoom: 1 };
const addMsg = (d: DiagramData, s: string, t: string) => reducer(d, {
  type: "ADD_CONNECTOR",
  payload: { sourceId: s, targetId: t, connectorType: "messageBPMN", directionType: "directed", routingType: "direct", sourceSide: "bottom", targetSide: "top" },
} as never);
const msgConn = (id: string, s: string, t: string): Connector =>
  ({ id, type: "messageBPMN", sourceId: s, targetId: t, waypoints: [] } as unknown as Connector);

describe("T4815 — an event with no Flow Type that already has a message faces that way", () => {
  // The seeded Order-to-Cash example: generation never stamps a Flow Type, so
  // "Customer Responds" receives from Customer with none. A second message the
  // OTHER way used to be accepted: the reducer flipped it to a throw and B42
  // then called its first message illegal.
  const pkg = JSON.parse(read("app", "lib", "riskControls", "o2cProjectExport.json")) as { diagrams: Array<{ name: string; data: { elements: DiagramElement[]; connectors: Connector[] } }> };
  const D = pkg.diagrams.find((d) => d.name.includes("Manage Disputes"))!.data;
  const cr = D.elements.find((e) => flat(e.label) === "Customer Responds")!;
  const cust = D.elements.find((e) => e.type === "pool" && flat(e.label) === "Customer")!;
  const data = () => ({ elements: structuredClone(D.elements), connectors: structuredClone(D.connectors), viewport: VIEW }) as DiagramData;

  it("the recorded case: a Message event with no Flow Type that receives from Customer", () => {
    expect(cr).toMatchObject({ type: "intermediate-event", eventType: "message" });
    expect(cr.flowType).toBeUndefined();
    expect(D.connectors.some((c) => c.type === "messageBPMN" && c.sourceId === cust.id && c.targetId === cr.id)).toBe(true);
  });

  it("the rule: it may take another message in, but not send one; without the connectors only the Flow Type counts", () => {
    const opts = { connectors: D.connectors };
    expect(messageFlowRefusal(cr, cust, D.elements, opts)).toBe("“Customer Responds” already receives a message, so it catches — it can't send one too");
    expect(canConnect(cr, cust, "messageBPMN", D.elements, opts)).toBe(false);
    expect(messageFlowRefusal(cust, cr, D.elements, opts)).toBeNull();
    expect(messageFlowRefusal(cr, cust, D.elements), "no connectors given: the Flow Type alone leaves it open").toBeNull();
  });

  it("voice numbers it as a receiver only, and blue lights only the receiving way", () => {
    const p = collectMessageTargets(D.elements, cr.id, D.connectors);
    expect("dirs" in p && p.dirs).toEqual({ to: false, from: true });
    const blue = (s: DiagramElement, t: DiagramElement) =>
      classifyDragTarget(s, t, computeDragContext(s, D.elements, D.connectors, s.id), D.elements, D.connectors, "bpmn").message;
    expect(blue(cr, cust)).toBe(false);
    expect(blue(cust, cr)).toBe(true);
  });

  it("voice and the reducer refuse the message the other way; the event stays a catch and B42 stays clean", () => {
    expect(checkConnectorLegality(D)).toEqual([]);
    const h = headlessDiagram(data());
    const r = applyAssistOps([{ op: "addMessage", fromRef: ID_REF_PREFIX + cr.id, toRef: ID_REF_PREFIX + cust.id }], h.context());
    expect(r.ok).toBe(false);
    expect(r.summary).toMatch(/already receives a message, so it catches/);
    expect(h.data.connectors).toHaveLength(D.connectors.length);
    const still = h.data.elements.find((e) => e.id === cr.id)!;
    expect(still.flowType).toBeUndefined();
    expect(isThrowingEvent(still)).toBe(false);
    expect(checkConnectorLegality(h.data)).toEqual([]);
    // The mouse drop lands in the reducer: it refuses too (reducer ≡ canConnect).
    expect(addMsg(data(), cr.id, cust.id).connectors).toHaveLength(D.connectors.length);
    // The receiving way is still open, and faces the event as a catch.
    const ok = addMsg(data(), cust.id, cr.id);
    expect(ok.connectors).toHaveLength(D.connectors.length + 1);
    expect(ok.elements.find((e) => e.id === cr.id)!.flowType).toBe("catching");
  });

  it("the mirror: one that already sends can't receive; B42 flags an event that does both, and a message never flags itself", () => {
    for (const eventType of ["message", undefined] as const) {
      const e = el("E", "intermediate-event", { parentId: "PA", ...(eventType ? { eventType } : {}) });
      const w = [PA, BB, e];
      const sends = [msgConn("out", "E", "BB")];
      expect(messageFlowRefusal(BB, e, w, { connectors: sends })).toBe("“E” already sends a message, so it throws — it can't receive one too");
      expect(messageFlowRefusal(e, BB, w, { connectors: sends })).toBeNull();
      expect(addMsg({ elements: w, connectors: sends, viewport: VIEW } as DiagramData, "BB", "E").connectors).toHaveLength(1);
      expect(checkConnectorLegality({ elements: w, connectors: sends }), "a lone message is judged without itself").toEqual([]);
      const both = [...sends, msgConn("in", "BB", "E")];
      expect(new Set(checkConnectorLegality({ elements: w, connectors: both }).map((v) => v.ids[0]))).toEqual(new Set(["out", "in"]));
    }
  });

  it("an explicit Flow Type still wins over the messages it has", () => {
    const e = el("E", "intermediate-event", { parentId: "PA", eventType: "message", flowType: "throwing" });
    // Inconsistent data (a throw that receives) — the Flow Type says what it is.
    const conns = [msgConn("in", "BB", "E")];
    expect(messageFlowRefusal(e, BB, [PA, BB, e], { connectors: conns })).toBeNull();
    expect(messageFlowRefusal(BB, e, [PA, BB, e], { connectors: conns })).toBe("“E” throws a message — it can only send one");
  });
});

describe("T4816 — review comments, task markers, reasons read aloud, one place for blue, numbering per pair", () => {
  it("addMessage from a review comment is refused with the rule's reason — it never draws a review link and calls it a message", () => {
    const d = paul();
    d.elements.push(el("rc", "review-comment", { x: 400, y: -400, label: "Check this" }));
    const h = headlessDiagram(d);
    const r = applyAssistOps([{ op: "addMessage", fromRef: ID_REF_PREFIX + "rc", toRef: ID_REF_PREFIX + ID["Customer"] }], h.context());
    expect(r).toEqual({ ok: false, summary: "can’t add a message Check this → Customer — “Check this” is a review comment — only tasks, subprocesses, black-box pools and events exchange messages" });
    expect(h.data.connectors).toHaveLength(PAUL.connectors.length);
  });

  it("a task that already exchanges a message the other way keeps its marker; one with none takes the marker for the way it runs", () => {
    // "Do nothing" is a Send task that sends "message 1" to SalesForce.
    const d = addMsg(paul(), ID["Customer"], ID["Do nothing"]);
    expect(d.connectors).toHaveLength(PAUL.connectors.length + 1);
    expect(d.elements.find((e) => e.id === ID["Do nothing"])!.taskType).toBe("send");
    const d2 = addMsg(paul(), ID["Customer"], ID["Pick items"]);
    expect(d2.elements.find((e) => e.id === ID["Pick items"])!.taskType).toBe("receive");
    // The mirror: a Receive task that already receives, now sending.
    const t = el("t", "task", { parentId: "PA", taskType: "receive" });
    const d3 = addMsg({ elements: [PA, BB, BB2, t], connectors: [msgConn("in", "BB", "t")], viewport: VIEW } as DiagramData, "t", "BB2");
    expect(d3.connectors).toHaveLength(2);
    expect(d3.elements.find((e) => e.id === "t")!.taskType).toBe("receive");
  });

  it("a reason read aloud takes the right article", () => {
    expect(whyCantSendMessage(inB("xe", "end-event", { eventType: "error" }), WORLD)).toMatch(/^has an Error trigger/);
    expect(whyCantSendMessage(inB("xx", "intermediate-event", { eventType: "escalation" }), WORLD)).toMatch(/^has an Escalation trigger/);
    expect(whyCantSendMessage(inB("xt", "intermediate-event", { eventType: "timer" }), WORLD)).toMatch(/^has a Timer trigger/);
  });

  it("blue is set in one place: no branch of the highlight computes it, and no other diagram type lights blue", () => {
    const src = code("app", "lib", "diagram", "connectorHighlight.ts");
    expect(src).not.toMatch(/message = true|message: true/);
    expect(src).not.toMatch(/isWhiteBoxPool|isVisibleParticipant|targetCanReceiveMsg|classifyPoolTarget/);
    const els = PAUL.elements;
    for (const s of els) for (const t of els) {
      const h = classifyDragTarget(s, t, computeDragContext(s, els, PAUL.connectors, s.id), els, PAUL.connectors, "state-machine");
      expect(h.message, `${s.id} → ${t.id}`).toBe(false);
    }
  });

  it("the numbering judges each end once and asks only the pair part per pair — the same numbers as the whole rule", () => {
    const src = code("app", "lib", "assist", "messageTargets.ts");
    const collect = src.slice(src.indexOf("export function collectMessageTargets"), src.indexOf("const NUM:"));
    expect(collect).toContain("!sameMessageParticipant(s, t, els, opts)");
    expect(collect).not.toContain("messageFlowRefusal(");
    // On the 37-row world, with an event already facing each way, pair mode
    // equals brute force over messageFlowRefusal.
    const conns = [msgConn("m1", "sender", "mu"), msgConn("m2", "pi", "BB")];
    const pick = collectMessageTargets(WORLD, null, conns);
    const brute = new Set<string>();
    for (const s of WORLD) for (const t of WORLD) {
      if (s.id !== t.id && messageFlowRefusal(s, t, WORLD, { connectors: conns }) === null) { brute.add(s.id); brute.add(t.id); }
    }
    expect("targets" in pick && new Set(pick.targets.map((x) => x.id))).toEqual(brute);
    // sameMessageParticipant is exactly the pair part of the rule.
    for (const s of WORLD) for (const t of WORLD) {
      if (s.id === t.id || whyCantSendMessage(s, WORLD) || whyCantReceiveMessage(t, WORLD)) continue;
      expect(messageFlowRefusal(s, t, WORLD) === null, `${s.id} → ${t.id}`).toBe(!sameMessageParticipant(s, t, WORLD));
    }
  });
});
