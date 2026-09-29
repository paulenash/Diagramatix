/**
 * Stage 4 of mobile voice — THE UTTERANCE ROUTER (runVoiceCommand), pinned by
 * behaviour before the voice block moves out of DiagramEditor.tsx into
 * app/hooks/useVoiceSession.ts. The same tests run against the block cut from
 * today's editor and, after the move, against the hook.
 *
 * Each test types into the session (the bar calls runVoiceCommand directly)
 * and reads what a person would see: the command log's lines, the diagram,
 * the open question (pickFlow / pendingConfirmRef), the queue, the fetches
 * to /api/ai/command and the fake recogniser.
 *
 * Tests named "CURRENT:" pin a quirk of today's code, kept deliberately by
 * the move (the move is UNEDITED — a behaviour change is a later, separate
 * decision).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import { INVENTED_RENAME_REFUSAL } from "@/app/lib/assist/aiGuards";
import type { DiagramData } from "@/app/lib/diagram/types";

beforeEach(() => {
  fakeDictation.reset();
  stubWindow();
  stubFetch(() => ({ ops: [] }));
});
afterEach(async () => {
  await unmountAll();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

// ── local helpers ────────────────────────────────────────────────────────────

/** The log as [heard, summary, ok, viaAi] — viaAi absent reads as null, so false and absent stay distinct. */
const brief = (h: Mounted) => h.log.map((l) => [l.heard, l.summary, l.ok, l.viaAi ?? null]);
const labels = (h: Mounted) => h.data.elements.map((e) => e.label);
const el = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id);
const byLabel = (h: Mounted, label: string) => h.data.elements.find((e) => e.label === label);
const canUndo = (h: Mounted) => (h.d as unknown as { canUndo: boolean }).canUndo;
const AI = "/api/ai/command";
const aiCalls = (calls: { url: string; body: unknown }[]) => calls.filter((c) => c.url === AI);
const instructions = (calls: { url: string; body: unknown }[]) => aiCalls(calls).map((c) => (c.body as { instruction: string }).instruction);

/**
 * A `fetch` whose AI replies wait for the test: every call parks until
 * `release(reply)` answers the oldest one still waiting. While `holding` is
 * false, calls answer at once with `instant`.
 */
function heldAi(instant: unknown = { ops: [] }) {
  const waiting: ((v: unknown) => void)[] = [];
  const s = {
    holding: true,
    calls: [] as { url: string; body: unknown }[],
    release(reply: unknown) { const r = waiting.shift(); if (!r) throw new Error("no AI call is waiting"); r(reply); },
  };
  s.calls = stubFetch(() => (s.holding ? new Promise((r) => { waiting.push(r); }) : instant));
  return s;
}

/**
 * Start a command WITHOUT awaiting it (its AI call is held). The promise comes
 * back in a box: an async function returning it bare would adopt it, and wait.
 */
async function startCommand(h: Mounted, text: string): Promise<{ done: Promise<void> }> {
  let done!: Promise<void>;
  await h.act(() => { done = h.session.runVoiceCommand(text); });
  return { done };
}

/** threeTasks with Pay supplier's id shaped like a real one (8 chars, letters + digits). */
function threeTasksRealIds(): DiagramData {
  const d = threeTasks();
  const ID = "k3f9a2bx";
  return {
    ...d,
    elements: d.elements.map((e) => (e.id === "t3" ? { ...e, id: ID } : e)),
    connectors: d.connectors.map((c) => (c.targetId === "t3" ? { ...c, targetId: ID } : c)),
  } as DiagramData;
}

// ── T5066 ───────────────────────────────────────────────────────────────────

describe("T5066 — the router: a grammar command applies at once with one log line carrying its ops, is ONE undo step, “again” repeats it, and a boundary move takes a follow-up amount", () => {
  it("a grammar command edits the diagram, writes exactly one line (viaAi false) carrying the parsed ops, and never calls the AI", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("  delete Pay supplier  ");
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    expect(brief(h)).toEqual([["delete Pay supplier", "deleted Pay supplier", true, false]]);
    expect(h.lastLine?.ops).toEqual([{ op: "delete", ref: "Pay supplier" }]);
    expect(typeof h.lastLine?.at).toBe("number");
    expect(calls).toHaveLength(0);
    await h.unmount();
  });

  it("a grammar command that PARSES but fails is reported as it failed — the AI is never asked to rescue it", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete Widget");
    expect(brief(h)).toEqual([["delete Widget", "couldn't find “Widget”", false, false]]);
    expect(h.lastLine?.ops).toEqual([{ op: "delete", ref: "Widget" }]);
    expect(calls).toHaveLength(0);
    expect(h.data.elements).toHaveLength(5);
    await h.unmount();
  });

  it("an insert that fans out into many reducer edits (add, re-join, make room) is ONE undo step: a spoken “undo” restores all of it and leaves nothing more to undo", async () => {
    const before = threeTasks();
    const h = await mountSession({ initial: before });
    expect(canUndo(h)).toBe(false);
    await h.typed("add a task called Approve after Check invoice");
    expect(brief(h)).toEqual([["add a task called Approve after Check invoice",
      "inserted Approve between Check invoice and Pay supplier — moved everything after Check invoice in Company 104px right to make room", true, false]]);
    const approve = byLabel(h, "Approve")!;
    expect(approve).toBeTruthy();
    expect(el(h, "t3")!.x).toBe(644);
    expect(h.data.connectors.map((c) => `${c.sourceId}->${c.targetId}`)).toEqual(["t1->t2", "t2->" + approve.id, approve.id + "->t3"]);
    expect(canUndo(h)).toBe(true);

    await h.typed("undo");
    expect(h.lastLine).toMatchObject({ heard: "undo", summary: "undid the last change", ok: true, ops: [{ op: "undo" }] });
    expect(h.data.elements.map((e) => [e.id, e.x, e.y, e.width, e.height])).toEqual(before.elements.map((e) => [e.id, e.x, e.y, e.width, e.height]));
    expect(h.data.connectors.map((c) => `${c.sourceId}->${c.targetId}`)).toEqual(["t1->t2", "t2->t3"]);
    expect(canUndo(h), "the whole command was one history entry").toBe(false);
    await h.unmount();
  });

  it("“again” repeats the last real command against the diagram as it is now — never an undo — and says so when there is nothing to repeat", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("again");
    expect(brief(h)).toEqual([["again", "nothing to repeat yet", false, false]]);
    expect(h.lastLine?.ops, "nothing was applied, so the line carries no ops").toBeUndefined();

    await h.typed("nudge Pay supplier right");
    expect(el(h, "t3")!.x).toBe(560);
    await h.typed("again");
    expect(el(h, "t3")!.x).toBe(580);
    expect(h.lastLine).toMatchObject({ heard: "again", summary: "nudged Pay supplier right 20px", ok: true, ops: [{ op: "nudgePool", ref: "Pay supplier", direction: "right" }] });

    // "undo" is not remembered as the command to repeat: "again" after it nudges once more.
    await h.typed("undo");
    expect(el(h, "t3")!.x).toBe(560);
    await h.typed("again");
    expect(el(h, "t3")!.x).toBe(580);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });

  it("the boundary follow-up: after “move Company bottom boundary down”, a bare amount sets the move IN ALL, said again it answers that it is there already — and the AI never sees either", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("move Company bottom boundary down");
    expect(el(h, "pool1")!.height).toBe(270);
    await h.typed("sixty pixels");
    expect(el(h, "pool1")!.height).toBe(310);
    expect(h.lastLine?.ops).toEqual([{ op: "movePoolBoundary", ref: "#id:pool1", boundary: "bottom", direction: "down", distance: 40 }]);
    await h.typed("sixty pixels");
    expect(el(h, "pool1")!.height).toBe(310);
    expect(brief(h)).toEqual([
      ["move Company bottom boundary down", "moved Company's bottom boundary down 20px", true, false],
      ["sixty pixels", "moved Company's bottom boundary down 40px (60px down in all)", true, null],
      ["sixty pixels", "it has moved 60px down already", true, null],
    ]);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });

  it("any other command ends the follow-up: “sixty pixels” after a nudge is not a boundary move — it goes to the AI", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("move Company bottom boundary down");
    await h.typed("nudge Pay supplier right");
    await h.typed("sixty pixels");
    expect(el(h, "pool1")!.height).toBe(270);
    expect(instructions(calls)).toEqual(["sixty pixels"]);
    expect(brief(h)[2]).toEqual(["sixty pixels", "didn’t understand that", false, true]);
    await h.unmount();
  });

  it("“export the diagram to JSON” calls the editor's export exactly once and logs “exported to JSON” — no AI, and “again” does not repeat it", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("export the diagram to JSON");
    expect(h.exports).toBe(1);
    expect(brief(h)).toEqual([["export the diagram to JSON", "exported to JSON", true, false]]);
    expect(h.lastLine?.ops).toEqual([{ op: "export", format: "json" }]);
    await h.typed("again");
    expect(h.exports).toBe(1);
    expect(brief(h)[1]).toEqual(["again", "nothing to repeat yet", false, false]);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });

  it("“add a task here” (pointerWorld): refused with the reason while the mouse has never been over the canvas; with a pointer, the task lands on it, unconnected", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    const pointer = h.session.pointerWorld as { current: { x: number; y: number } | null };
    expect(pointer.current).toBeNull();
    await h.typed("add a task here");
    expect(brief(h)).toEqual([["add a task here", "I don't know where “here” is — move the mouse over the canvas first", false, false]]);
    expect(h.data.elements).toHaveLength(5);

    pointer.current = { x: 800, y: 125 };           // clear space in the lane, right of Pay supplier
    await h.typed("add a task here");
    expect(h.lastLine).toMatchObject({ heard: "add a task here", ok: true, viaAi: false, ops: [{ op: "add", symbolType: "task", at: "pointer" }] });
    expect(h.data.elements).toHaveLength(6);
    const added = h.data.elements[5];
    expect(added.type).toBe("task");
    expect({ x: added.x + added.width / 2, y: added.y + added.height / 2 }).toEqual({ x: 800, y: 125 });
    expect(h.data.connectors.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });
});

// ── T5067 ───────────────────────────────────────────────────────────────────

describe("T5067 — the router: the AI fallback (request, canonical, ops, failures, the invented-rename guard), the queue behind a call in flight, and a typed “stop”", () => {
  it("what grammar cannot parse is POSTed to /api/ai/command with the instruction, the diagram and the selection; the ops that come back are applied and logged viaAi with those ops", async () => {
    const calls = stubFetch(() => ({ ops: [{ op: "delete", ref: "Pay supplier" }] }));
    const start = threeTasks();
    const h = await mountSession({ initial: start });
    await h.select(["t2"]);
    await h.typed("  the paying bit has to go ");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(AI);
    const body = calls[0].body as { instruction: string; state: { elements: unknown[]; connectors: unknown[] }; selectedIds: string[] };
    expect(Object.keys(body).sort()).toEqual(["instruction", "selectedIds", "state"]);
    expect(body.instruction).toBe("the paying bit has to go");
    expect(body.selectedIds).toEqual(["t2"]);
    expect(Object.keys(body.state).sort()).toEqual(["connectors", "elements"]);
    expect((body.state.elements as { id: string; label: string }[]).map((e) => [e.id, e.label])).toEqual(start.elements.map((e) => [e.id, e.label]));
    expect((body.state.connectors as { id: string }[]).map((c) => c.id)).toEqual(["c1", "c2"]);

    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    expect(brief(h)).toEqual([["the paying bit has to go", "deleted Pay supplier", true, true]]);
    expect(h.lastLine?.ops).toEqual([{ op: "delete", ref: "Pay supplier" }]);
    expect(h.session.voiceBusy).toBe(false);
    expect(h.session.voiceBusyRef.current).toBe(false);
    await h.unmount();
  });

  it("the AI's canonical sentence is preferred over its ops — re-parsed by the grammar, shown with ids turned into names; a canonical that does not parse falls back to the ops", async () => {
    let reply: unknown = null;
    stubFetch(() => reply);
    const h = await mountSession({ initial: threeTasksRealIds() });
    reply = { canonical: "delete k3f9a2bx", ops: [{ op: "delete", ref: "Receive order" }] };
    await h.typed("the paying bit has to go");
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    expect(brief(h)[0]).toEqual(["the paying bit has to go", "“delete Pay supplier” → deleted Pay supplier", true, true]);
    expect(h.lastLine?.ops).toEqual([{ op: "delete", ref: "k3f9a2bx" }]);

    reply = { canonical: "please do the needful", ops: [{ op: "delete", ref: "Receive order" }] };
    await h.typed("the receiving bit has to go");
    expect(labels(h)).toEqual(["Company", "Clerk", "Check invoice"]);
    expect(brief(h)[1]).toEqual(["the receiving bit has to go", "deleted Receive order", true, true]);
    await h.unmount();
  });

  it("a not-ok reply says “didn’t understand that”; empty ops say the same; a fetch that throws says “command service unavailable” — each viaAi, nothing changed, and busy cleared", async () => {
    let reply: unknown = null;
    const calls = stubFetch(() => { if (reply instanceof Error) throw reply; return reply; });
    const h = await mountSession({ initial: threeTasks() });
    reply = new Response("nope", { status: 500 });
    await h.typed("make it pretty");
    reply = { ops: [] };
    await h.typed("make it prettier");
    reply = new Error("network down");
    await h.typed("make it prettiest");
    expect(brief(h)).toEqual([
      ["make it pretty", "didn’t understand that", false, true],
      ["make it prettier", "didn’t understand that", false, true],
      ["make it prettiest", "command service unavailable", false, true],
    ]);
    expect(aiCalls(calls)).toHaveLength(3);
    expect(h.data.elements).toHaveLength(5);
    expect(h.session.voiceBusy).toBe(false);
    expect(h.session.voiceBusyRef.current).toBe(false);
    await h.unmount();
  });

  it("the AI never invents a rename: a rename it returns — as canonical or as ops — for words with no naming word is refused (INVENTED_RENAME_REFUSAL) and nothing is renamed", async () => {
    let reply: unknown = null;
    stubFetch(() => reply);
    const h = await mountSession({ initial: threeTasks() });
    reply = { canonical: "rename Check invoice to Coverage Check" };
    await h.typed("Coverage Check? claim");
    reply = { ops: [{ op: "rename", ref: "Check invoice", label: "Coverage" }] };
    await h.typed("Coverage Check? claim");
    expect(brief(h)).toEqual([
      ["Coverage Check? claim", INVENTED_RENAME_REFUSAL, false, true],
      ["Coverage Check? claim", INVENTED_RENAME_REFUSAL, false, true],
    ]);
    expect(el(h, "t2")!.label).toBe("Check invoice");

    // With a naming word said, the same kind of canonical is applied.
    reply = { canonical: "rename Check invoice to Verify invoice" };
    await h.typed("the checking step should be called Verify invoice");
    expect(el(h, "t2")!.label).toBe("Verify invoice");
    expect(h.lastLine).toMatchObject({ viaAi: true, ok: true });
    expect(h.lastLine?.summary.startsWith("“rename Check invoice to Verify invoice” → ")).toBe(true);
    await h.unmount();
  });

  it("the queue: while an AI call is in flight a second and third command get “waiting for the previous command…”; when the call finishes they have NOT run yet — they drain one per render, in order, against the diagram the AI left", async () => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "make it pretty");
    expect(h.session.voiceBusy).toBe(true);
    expect(h.session.voiceBusyRef.current).toBe(true);
    await h.typed("delete Audit trail");
    await h.typed("delete Pay supplier");
    expect(brief(h)).toEqual([
      ["delete Audit trail", "waiting for the previous command…", true, null],
      ["delete Pay supplier", "waiting for the previous command…", true, null],
    ]);
    expect(h.session.voiceQueueRef.current).toEqual(["delete Audit trail", "delete Pay supplier"]);
    expect(labels(h)).toContain("Pay supplier");

    let queueWhenTheCallFinished: string[] = [];
    await h.act(async () => {
      ai.release({ ops: [{ op: "add", symbolType: "task", label: "Audit trail" }] });
      await first.done;
      queueWhenTheCallFinished = [...h.session.voiceQueueRef.current];
    });
    expect(queueWhenTheCallFinished, "the finishing call does not run the next command itself").toEqual(["delete Audit trail", "delete Pay supplier"]);

    expect(brief(h)).toEqual([
      ["delete Audit trail", "waiting for the previous command…", true, null],
      ["delete Pay supplier", "waiting for the previous command…", true, null],
      ["make it pretty", "added Audit trail", true, true],
      ["delete Audit trail", "deleted Audit trail", true, false],
      ["delete Pay supplier", "deleted Pay supplier", true, false],
    ]);
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    expect(h.session.voiceQueueRef.current).toEqual([]);
    expect(h.session.voiceBusy).toBe(false);
    expect(ai.calls).toHaveLength(1);
    await h.unmount();
  });

  it("the queue drains ONE command per render: two DEPENDENT commands queued behind a call — “add a task called Zed”, then “delete Zed” — both succeed, in order (drained together against one render, the delete could not find Zed)", async () => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "make it pretty");
    await h.typed("add a task called Zed");
    await h.typed("delete Zed");
    expect(h.session.voiceQueueRef.current).toEqual(["add a task called Zed", "delete Zed"]);

    await h.act(async () => { ai.release({ ops: [] }); await first.done; });
    expect(brief(h)).toEqual([
      ["add a task called Zed", "waiting for the previous command…", true, null],
      ["delete Zed", "waiting for the previous command…", true, null],
      ["make it pretty", "didn’t understand that", false, true],
      ["add a task called Zed", "added Zed", true, false],
      ["delete Zed", "deleted Zed", true, false],
    ]);
    expect(h.log.some((l) => l.summary.startsWith("couldn't find"))).toBe(false);
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier"]);
    expect(h.session.voiceQueueRef.current).toEqual([]);
    expect(ai.calls).toHaveLength(1);
    await h.unmount();
  });

  it("a command typed while the queue is still DRAINING (the call has finished, busy is false, the queue not yet empty) gets “waiting for the previous command…” too, and runs LAST", async () => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "make it pretty");
    await h.typed("delete Audit trail");
    await h.typed("delete Pay supplier");

    let whenTyped: { busy: boolean; queue: string[] } | null = null;
    await h.act(async () => {
      ai.release({ ops: [{ op: "add", symbolType: "task", label: "Audit trail" }] });
      await first.done;
      // The call is over and nothing has rendered: busy is false, the queue is not empty.
      whenTyped = { busy: h.session.voiceBusyRef.current, queue: [...h.session.voiceQueueRef.current] };
      void h.session.runVoiceCommand("delete Check invoice");
    });
    expect(whenTyped).toEqual({ busy: false, queue: ["delete Audit trail", "delete Pay supplier"] });
    expect(brief(h)).toEqual([
      ["delete Audit trail", "waiting for the previous command…", true, null],
      ["delete Pay supplier", "waiting for the previous command…", true, null],
      ["make it pretty", "added Audit trail", true, true],
      ["delete Check invoice", "waiting for the previous command…", true, null],
      ["delete Audit trail", "deleted Audit trail", true, false],
      ["delete Pay supplier", "deleted Pay supplier", true, false],
      ["delete Check invoice", "deleted Check invoice", true, false],
    ]);
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order"]);
    expect(h.session.voiceQueueRef.current).toEqual([]);
    expect(ai.calls).toHaveLength(1);
    await h.unmount();
  });

  it("a typed “stop” while an AI call runs with commands queued: it does not queue, it empties the queue, stops the mic, logs “stopped listening” — the queued commands never run (no further fetch), and the call in flight is ignored when it lands", async () => {
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    await h.act(() => h.session.setVoiceAssistOn(true));
    await h.act(() => h.session.toggleAbraListening());
    expect(h.session.voiceListening).toBe(true);
    expect(fakeDictation.sessions).toHaveLength(1);

    const first = await startCommand(h, "make it pretty");
    await h.typed("delete Receive order");       // grammar — would run from the queue
    await h.typed("I want a fresh start");       // unparseable — would be a second AI call
    expect(h.session.voiceQueueRef.current).toEqual(["delete Receive order", "I want a fresh start"]);

    await h.typed("stop");
    expect(h.session.voiceQueueRef.current).toEqual([]);
    expect(fakeDictation.current.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
    expect(h.lastLine?.viaAi).toBeUndefined();

    ai.holding = false;
    await h.act(async () => { ai.release({ ops: [] }); await first.done; });
    await h.act(() => undefined);
    expect(ai.calls, "the queued AI command never asked").toHaveLength(1);
    expect(labels(h)).toContain("Receive order");
    expect(brief(h)).toEqual([
      ["delete Receive order", "waiting for the previous command…", true, null],
      ["I want a fresh start", "waiting for the previous command…", true, null],
      ["stop", "stopped listening", true, null],
      ["make it pretty", "ignored — you said stop", false, true],
    ]);
    await h.unmount();
  });

  it("a typed “stop” drops the AI call already in flight: its reply, when it lands, is NOT applied — logged “ignored — you said stop” (viaAi, not ok), and nothing to undo", async () => {
    // Paul's ruling, 2026-09-29: "stop" means stop. The fetch cannot be
    // abandoned, but the stop moves voiceStopSeq on, and a reply that lands
    // after it is dropped rather than applied.
    const ai = heldAi({ ops: [{ op: "add", symbolType: "task", label: "Audit trail" }] });
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "make it pretty");
    await h.typed("stop");
    expect(h.session.voiceBusyRef.current, "the call is still out — it cannot be recalled, only ignored").toBe(true);
    await h.act(async () => { ai.release({ ops: [{ op: "add", symbolType: "task", label: "Audit trail" }] }); await first.done; });
    expect(labels(h)).not.toContain("Audit trail");
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier"]);
    expect(brief(h)).toEqual([
      ["stop", "stopped listening", true, null],
      ["make it pretty", "ignored — you said stop", false, true],
    ]);
    expect(h.lastLine?.ops).toBeUndefined();
    expect(canUndo(h)).toBe(false);
    expect(h.session.voiceBusyRef.current).toBe(false);
    expect(h.session.voiceBusy).toBe(false);
    // The NEXT command's call is its own: the same reply, answered at once, applies as usual.
    ai.holding = false;
    await h.typed("make it pretty");
    expect(ai.calls).toHaveLength(2);
    expect(h.lastLine).toMatchObject({ heard: "make it pretty", summary: "added Audit trail", ok: true, viaAi: true });
    expect(labels(h)).toContain("Audit trail");
    await h.unmount();
  });

  it("CURRENT: an AI command applies against the diagram as it was when the command STARTED — an element the mouse renamed during the call is still found by its old name and deleted (a quirk kept deliberately by the move)", async () => {
    // QUIRK, kept deliberately by the move: the router's closure (`data`, and the
    // applyGrouped → applyAssistOps built over it) is the render the command
    // started in. The queue guards against a SPOKEN command racing the call; a
    // mouse edit during the call is not guarded, and the AI's ops resolve names
    // against the diagram from before it.
    const ai = heldAi();
    const h = await mountSession({ initial: threeTasks() });
    const first = await startCommand(h, "the paying bit has to go");
    await h.act(() => h.d.updateLabel("t3", "Settle bill"));
    expect(el(h, "t3")!.label).toBe("Settle bill");
    await h.act(async () => { ai.release({ ops: [{ op: "delete", ref: "Pay supplier" }] }); await first.done; });
    // Against the diagram as it is now, "Pay supplier" names nothing; the call's closure still has it.
    expect(el(h, "t3")).toBeUndefined();
    expect(brief(h)).toEqual([["the paying bit has to go", "deleted Pay supplier", true, true]]);
    expect((ai.calls[0].body as { state: { elements: { id: string; label: string }[] } }).state.elements.find((e) => e.id === "t3")!.label).toBe("Pay supplier");
    await h.unmount();
  });
});

// ── T5068 ───────────────────────────────────────────────────────────────────

describe("T5068 — the router's questions: “clear the diagram” asks and the next utterance answers; an ambiguous name opens a numbered pick that a number answers, a new command interrupts and “cancel”/“done” closes", () => {
  it("“clear the diagram” asks and changes nothing; “no” cancels it — the diagram is kept and the question is gone", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("clear the diagram");
    expect(h.data.elements).toHaveLength(5);
    expect(h.session.pendingConfirmRef.current).toEqual({ ops: [{ op: "clear" }], what: "clear the whole diagram (5 elements)", viaAi: false });
    expect(h.lastLine?.ops, "nothing applied yet").toBeUndefined();
    await h.typed("no");
    expect(h.session.pendingConfirmRef.current).toBeNull();
    expect(h.data.elements).toHaveLength(5);
    expect(brief(h)).toEqual([
      ["clear the diagram", "clear the whole diagram (5 elements)? — say “yes” to confirm", true, false],
      ["no", "cancelled — did not clear the whole diagram (5 elements)", true, false],
    ]);
    await h.unmount();
  });

  it("“yes” confirms exactly once: the diagram is cleared with one “confirmed →” line, and a second “yes” is no answer (it goes to the AI)", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("clear the diagram");
    await h.typed("yes");
    expect(h.data.elements).toEqual([]);
    expect(h.data.connectors).toEqual([]);
    expect(h.lastLine).toMatchObject({ heard: "yes", summary: "confirmed → cleared the diagram", ok: true, viaAi: false, ops: [{ op: "clear" }] });
    expect(aiCalls(calls)).toHaveLength(0);
    await h.typed("yes");
    expect(h.log.filter((l) => l.summary.startsWith("confirmed"))).toHaveLength(1);
    expect(brief(h)[2]).toEqual(["yes", "didn’t understand that", false, true]);
    expect(instructions(calls)).toEqual(["yes"]);
    await h.unmount();
  });

  it("anything else answers with the cancel line and then runs as a new command", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("clear the diagram");
    await h.typed("delete Pay supplier");
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice"]);
    expect(brief(h)).toEqual([
      ["clear the diagram", "clear the whole diagram (5 elements)? — say “yes” to confirm", true, false],
      ["delete Pay supplier", "cancelled — did not clear the whole diagram (5 elements)", true, false],
      ["delete Pay supplier", "deleted Pay supplier", true, false],
    ]);
    expect(h.log[1].ops).toBeUndefined();
    expect(h.log[2].ops).toEqual([{ op: "delete", ref: "Pay supplier" }]);
    expect(h.session.pendingConfirmRef.current).toBeNull();
    await h.unmount();
  });

  it("a clear the AI proposes asks too, and the question and its answer both carry viaAi", async () => {
    let reply: unknown = { ops: [{ op: "clear" }] };
    stubFetch(() => reply);
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("I want a fresh start");
    expect(h.data.elements).toHaveLength(5);
    reply = { ops: [] };
    await h.typed("yes");
    expect(h.data.elements).toEqual([]);
    expect(brief(h)).toEqual([
      ["I want a fresh start", "clear the whole diagram (5 elements)? — say “yes” to confirm", true, true],
      ["yes", "confirmed → cleared the diagram", true, true],
    ]);
    await h.unmount();
  });

  it("a parked question dies with “stop”, and with a change of diagram: the “yes” after either clears nothing", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("clear the diagram");
    await h.typed("stop");
    expect(h.session.pendingConfirmRef.current).toBeNull();
    await h.typed("yes");
    expect(h.data.elements).toHaveLength(5);

    await h.typed("clear the diagram");
    expect(h.session.pendingConfirmRef.current).not.toBeNull();
    await h.rerender({ diagramId: "diagram-2" });
    expect(h.session.pendingConfirmRef.current).toBeNull();
    await h.typed("yes");
    expect(h.data.elements).toHaveLength(5);
    expect(h.log.filter((l) => l.summary.startsWith("confirmed"))).toHaveLength(0);
    expect(instructions(calls)).toEqual(["yes", "yes"]);
    await h.unmount();
  });

  it("an ambiguous name opens a numbered pick (the command parked, ok, nothing changed); a wrong number repeats the question; “2” applies the parked command to the second", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    const PROMPT = "which “task”? say a number (1–3), or “cancel”";
    await h.typed("delete the task");
    expect(h.data.elements).toHaveLength(5);
    const flow = h.session.pickFlow as { ops: unknown[]; ref: string; prompt: string; targets: { id: string; n: number }[] };
    expect(flow).toMatchObject({ ops: [{ op: "delete", ref: "task" }], ref: "task", prompt: PROMPT });
    expect(flow.targets.map((t) => [t.n, t.id])).toEqual([[1, "t1"], [2, "t2"], [3, "t3"]]);

    await h.typed("7");
    expect(h.session.pickFlow).not.toBeNull();
    await h.typed("2");
    expect(h.session.pickFlow).toBeNull();
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Pay supplier"]);
    expect(brief(h)).toEqual([
      ["delete the task", PROMPT, true, false],
      ["7", PROMPT, false, null],
      ["2", "2 → deleted Check invoice", true, null],
    ]);
    expect(h.lastLine?.ops, "the parked command re-run with the pick as an #id: reference").toEqual([{ op: "delete", ref: "#id:t2" }]);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });

  it("a whole new command while the pick is up closes it and runs — nothing is picked", async () => {
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete the task");
    expect(h.session.pickFlow).not.toBeNull();
    await h.typed("add a task called Zeta");
    expect(h.session.pickFlow).toBeNull();
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier", "Zeta"]);
    expect(brief(h)[1]).toEqual(["add a task called Zeta", "added Zeta", true, false]);
    await h.unmount();
  });

  it("a typed “stop” closes an open “which one?” pick — the numbers go, and a number after it is no answer: it goes to the AI and deletes nothing", async () => {
    // Paul's ruling, 2026-09-29: a stop ends every QUESTION — a waiting
    // "clear the diagram?" and a "which one?" pick alike. (Not the template
    // window, flows.test.ts.) A spoken "stop" takes the same stopAbraListening path.
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete the task");
    expect(h.session.pickFlow).not.toBeNull();
    await h.typed("stop");
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
    expect(h.session.pickFlow).toBeNull();
    await h.typed("2");
    expect(h.session.pickFlow).toBeNull();
    expect(labels(h)).toEqual(["Company", "Clerk", "Receive order", "Check invoice", "Pay supplier"]);
    expect(brief(h)).toEqual([
      ["delete the task", "which “task”? say a number (1–3), or “cancel”", true, false],
      ["stop", "stopped listening", true, null],
      ["2", "didn’t understand that", false, true],
    ]);
    expect(instructions(calls)).toEqual(["2"]);
    await h.unmount();
  });

  it("“cancel” and “done” close the pick with “cancelled” and change nothing", async () => {
    const calls = stubFetch(() => ({ ops: [] }));
    const h = await mountSession({ initial: threeTasks() });
    await h.typed("delete the task");
    await h.typed("cancel");
    expect(h.session.pickFlow).toBeNull();
    await h.typed("delete the task");
    await h.typed("done");
    expect(h.session.pickFlow).toBeNull();
    expect(h.data.elements).toHaveLength(5);
    expect(brief(h).map((l) => l.slice(0, 3))).toEqual([
      ["delete the task", "which “task”? say a number (1–3), or “cancel”", true],
      ["cancel", "cancelled", true],
      ["delete the task", "which “task”? say a number (1–3), or “cancel”", true],
      ["done", "cancelled", true],
    ]);
    expect(calls).toHaveLength(0);
    await h.unmount();
  });
});
