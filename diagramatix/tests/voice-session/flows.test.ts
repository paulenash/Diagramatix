/**
 * Stage 4 of mobile voice — the GUIDED FLOWS of the Voice Assist session,
 * pinned by behaviour before the session block moves out of DiagramEditor.tsx
 * (and run, unchanged, against the moved hook after).
 *
 * The flows: rename by number, message by number, "move dividers", the
 * template window's answers (the window itself is the editor's — only the
 * session's side is driven here, through the refs the editor fills), and the
 * ways out of each: "done", "stop", a whole new command, and Escape.
 *
 * Every log line asserted here is copied from the code (the voice block in
 * DiagramEditor.tsx, app/lib/assist/*), not from memory.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/app/lib/dictation", async (orig) => {
  const { fakeDictation } = await import("./fakeDictation");
  return { ...(await orig<typeof import("@/app/lib/dictation")>()), startDictation: (cb: never) => fakeDictation.start(cb) };
});

import { failOnActWarnings, mountSession, stubFetch, stubWindow, threeTasks, unmountAll, type Mounted } from "./harness";
import { fakeDictation } from "./fakeDictation";
import type { DiagramData, DiagramElement } from "@/app/lib/diagram/types";
import { TEMPLATE_BEFORE_REFUSAL } from "@/app/lib/assist/templatePhrase";
import { FRAGMENT_SILENCE_MS } from "@/app/lib/assist/fragmentBuffer";
import { GOLD_FLASH_KEY } from "@/app/lib/assist/goldFlash";
import type { TemplateCard } from "@/app/lib/assist/templatePick";

let win: ReturnType<typeof stubWindow>;
let calls: ReturnType<typeof stubFetch>;

beforeEach(() => {
  fakeDictation.reset();
  win = stubWindow();
  calls = stubFetch(() => ({ ops: [] }));
});
afterEach(async () => {
  // Unmount while `window` is still stubbed: the Escape effect's cleanup reads it.
  await unmountAll();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  failOnActWarnings();
});

// ── local helpers ────────────────────────────────────────────────────────────

/** A session (unmounted by afterEach's unmountAll, if the test does not). */
const mount = (initial: DiagramData, opts: { templateWindowReply?: string } = {}): Promise<Mounted> => mountSession({ initial, ...opts });
/** Unmount one session early, so only one Escape listener sits on the shared window. */
const unmountNow = (h: Mounted) => h.unmount();

const aiCalls = () => calls.filter((c) => c.url === "/api/ai/command");
const lines = (h: Mounted) => h.log.map((l) => ({ heard: l.heard, summary: l.summary, ok: l.ok }));
const label = (h: Mounted, id: string) => h.data.elements.find((e) => e.id === id)?.label;
const box = (h: Mounted, id: string) => {
  const e = h.data.elements.find((x) => x.id === id)!;
  return { y: e.y, height: e.height };
};
const messages = (h: Mounted) =>
  h.data.connectors.filter((c) => c.type === "messageBPMN").map((c) => ({ from: c.sourceId, to: c.targetId, label: c.label }));
/** The same, the label lower-cased: a label's case is messageTargets.ts's decision, not the session's. */
const messagesAnyCase = (h: Mounted) => messages(h).map((m) => ({ ...m, label: m.label?.toLowerCase() }));

/** The flows' state, read loosely (the session's own types are checked where it is used). */
type Flow = Record<string, unknown> | null;
const rename = (h: Mounted) => h.session.renameFlow as Flow;
const message = (h: Mounted) => h.session.messageFlow as Flow;
const dividers = (h: Mounted) => h.session.dividerFlow as Flow;

/** threeTasks() plus a black-box pool below it — a message runs between two pools. */
function twoPools(): DiagramData {
  const d = threeTasks();
  const supplier = { id: "pool2", type: "pool", x: 0, y: 320, width: 900, height: 120, label: "Supplier", properties: { poolType: "black-box" } } as unknown as DiagramElement;
  return { ...d, elements: [...d.elements, supplier] };
}

/** One pool, two lanes (one divider between them at y=200), a task in each. */
function twoLanes(): DiagramData {
  const el = (e: Record<string, unknown>) => e as unknown as DiagramElement;
  return {
    elements: [
      el({ id: "pool1", type: "pool", x: 0, y: 0, width: 900, height: 400, label: "Company", properties: { poolType: "white-box" } }),
      el({ id: "lane1", type: "lane", x: 30, y: 0, width: 870, height: 200, label: "Clerk", parentId: "pool1", properties: {} }),
      el({ id: "lane2", type: "lane", x: 30, y: 200, width: 870, height: 200, label: "Manager", parentId: "pool1", properties: {} }),
      el({ id: "t1", type: "task", x: 100, y: 60, width: 120, height: 70, label: "Receive order", parentId: "lane1", properties: { taskType: "user" } }),
      el({ id: "t2", type: "task", x: 320, y: 260, width: 120, height: 70, label: "Approve order", parentId: "lane2", properties: { taskType: "user" } }),
    ],
    connectors: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  } as DiagramData;
}

/** threeTasks() with Pay supplier renamed so two tasks share "Check invoice" — the picker's case. */
function twoSameNames(): DiagramData {
  const d = threeTasks();
  return { ...d, elements: d.elements.map((e) => (e.id === "t3" ? { ...e, label: "Check invoice" } : e)) };
}

// ── the template window, from the session's side ──
// The window and its picks are the editor's code (outside the block): the
// editor sets `templateFlow` when it opens the window and fills these refs.
// Here recorders stand in for them.
type Report = (r: { ok: boolean; summary: string }) => void;
interface TemplateSide {
  templateFlow: unknown;
  setTemplateFlow: (f: unknown) => void;
  closeTemplateFlowRef: { current: (keep: boolean) => string };
  pickTemplateCardRef: { current: (card: TemplateCard, report: Report) => Promise<void> };
  reanchorTemplateRef: { current: (ref: string, report: Report) => Promise<void> };
  templateScrollRef: { current: unknown };
}
const CARDS: TemplateCard[] = [
  { n: 1, id: "tpl-a", name: "Invoice approval", group: null, source: "builtin" },
  { n: 2, id: "tpl-b", name: "Customer onboarding", group: null, source: "builtin" },
];
function templateSide(h: Mounted) { return h.session as unknown as TemplateSide; }
async function openTemplateWindow(h: Mounted, opts: { showing?: boolean } = {}) {
  const rec = { closes: [] as boolean[], picks: [] as string[], anchors: [] as string[] };
  const s = templateSide(h);
  s.closeTemplateFlowRef.current = (keep) => { rec.closes.push(keep); s.setTemplateFlow(null); return keep ? "kept the template" : "templates closed"; };
  s.pickTemplateCardRef.current = async (card, report) => { rec.picks.push(card.name); report({ ok: true, summary: `showing ${card.name}` }); };
  s.reanchorTemplateRef.current = async (ref, report) => { rec.anchors.push(ref); report({ ok: true, summary: `now after ${ref}` }); };
  await h.act(() => s.setTemplateFlow({
    openId: "w1", sections: [], cards: CARDS,
    provisional: opts.showing ? { card: CARDS[0], stamp: 1, base: { elements: [], connectors: [] }, ids: {} } : null,
    hiddenInitial: 0, hiddenContainer: 0, selectionAtOpen: [],
  }));
  return rec;
}

// ═════════════════════════════════════════════════════════════════════════════

describe("T5069 — rename by number: the numbers, the name, spelled letters, and the ways out", () => {
  const PROMPT = "pick a task by number, then say the new name — “cancel” to stop, “done” when finished";

  it("“rename tasks” numbers every task in reading order and waits — no AI call", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    const f = rename(h)!;
    expect(f.phase).toBe("pick");
    expect(f.itemType).toBe("task");
    expect((f.targets as { id: string; n: number; kind: string }[]).map((t) => [t.n, t.id, t.kind]))
      .toEqual([[1, "t1", "element"], [2, "t2", "element"], [3, "t3", "element"]]);
    expect(lines(h)).toEqual([{ heard: "rename tasks", summary: PROMPT, ok: true }]);
    expect(aiCalls()).toHaveLength(0);
  });

  it("a number picks (label edit begins on it); the next utterance is the name — first word capitalised, punctuation dropped — and the numbers come back", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("two");
    expect(h.labelEdits).toEqual(["t2"]);
    expect(rename(h)).toEqual({ phase: "name", itemType: "task", targetId: "t2", kind: "element" });
    expect(h.log).toHaveLength(1); // the pick itself writes no line

    const flashesBefore = h.session.goldFlash.runId;
    await h.typed("approve invoice.");
    expect(label(h, "t2")).toBe("Approve invoice");
    expect(h.lastLine).toMatchObject({ heard: "Approve invoice", summary: "renamed to “Approve invoice” — pick another or say “done”", ok: true });
    // Back in the loop: the same type numbered again.
    expect(rename(h)!.phase).toBe("pick");
    expect((rename(h)!.targets as { id: string }[]).map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    // The flow arms the gold flash itself (it never touches the op batch).
    expect(h.session.goldFlash.runId).toBe(flashesBefore + 1);
    expect((h.session.goldFlash.targets as { id: string }[]).map((t) => t.id)).toContain("t2");
    expect(aiCalls()).toHaveLength(0);
  });

  it("number and name in one breath — “3 pay the supplier” — and a SPELLED name is joined into one word", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("3 pay the supplier");
    expect(label(h, "t3")).toBe("Pay the supplier");
    expect(h.labelEdits).toEqual(["t3"]);
    expect(h.lastLine?.summary).toBe("renamed to “Pay the supplier” — pick another or say “done”");

    await h.typed("1 F I N A N C E");
    expect(label(h, "t1")).toBe("Finance");
    expect(h.lastLine).toMatchObject({ heard: "Finance", summary: "renamed to “Finance” — pick another or say “done”", ok: true });
    expect(rename(h)!.phase).toBe("pick");
  });

  it("a wrong answer keeps the numbers up — no such number, no number at all, even a whole command (it is never run)", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("7 foo");
    await h.typed("hello");
    await h.typed("delete Pay supplier");
    expect(lines(h).slice(1)).toEqual([
      { heard: "7 foo", summary: "there’s no number 7", ok: false },
      { heard: "hello", summary: "say the number of the item to rename", ok: false },
      { heard: "delete Pay supplier", summary: "say the number of the item to rename", ok: false },
    ]);
    expect(label(h, "t3")).toBe("Pay supplier");
    expect(rename(h)!.phase).toBe("pick");
    expect(aiCalls()).toHaveLength(0);
  });

  it("an empty name cancels the rename; “done” finishes the loop — and after it, words go back to the ordinary path", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("2");
    await h.typed(" . ");
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename cancelled (empty name)", ok: true });
    expect(rename(h)).toBeNull();
    expect(label(h, "t2")).toBe("Check invoice");

    await h.typed("rename tasks");
    await h.typed("done");
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    expect(rename(h)).toBeNull();

    // No flow open: "2 Approve" is no longer an answer — it goes to the AI.
    await h.typed("2 Approve");
    expect(aiCalls()).toHaveLength(1);
    expect(aiCalls()[0].body).toMatchObject({ instruction: "2 Approve" });
    expect(h.lastLine).toMatchObject({ heard: "2 Approve", ok: false, viaAi: true });
    expect(label(h, "t2")).toBe("Check invoice");
  });

  it("“undo” inside the flow drops the numbers AND undoes — the rename just made is reverted", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("2 approve invoice");
    expect(label(h, "t2")).toBe("Approve invoice");
    await h.typed("undo");
    expect(rename(h)).toBeNull();
    expect(label(h, "t2")).toBe("Check invoice");
    expect(lines(h).slice(-2)).toEqual([
      { heard: "", summary: "rename cancelled", ok: true },
      { heard: "undo", summary: "undid the last change", ok: true },
    ]);
  });

  it("“rename connectors” numbers the sequence flows; a pick labels the connector and begins no element label edit", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename connectors");
    const f = rename(h)!;
    expect(f.itemType).toBe("connector");
    expect((f.targets as { id: string; kind: string }[]).map((t) => [t.id, t.kind])).toEqual([["c1", "connector"], ["c2", "connector"]]);
    await h.typed("1 approved path");
    expect(h.data.connectors.find((c) => c.id === "c1")?.label).toBe("Approved path");
    expect(h.labelEdits).toEqual([]);
    expect(h.lastLine?.summary).toBe("renamed to “Approved path” — pick another or say “done”");
  });

  it("nothing of that type: the flow never opens", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename gateways");
    expect(rename(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ summary: "there are no gateways to rename", ok: false });
  });

  it("a typed “stop” ends the flow with the mic", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("stop");
    expect(rename(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
  });

  it("from the mic: “rename tasks” and a picked number act at once (no silence wait); the name waits for the silence", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const h = await mount(threeTasks());
    await h.act(() => h.session.toggleAbraListening());
    const mic = fakeDictation.current;

    await h.act(() => mic.cb.onText?.("rename tasks"));
    expect(rename(h)!.phase).toBe("pick");            // no timer advanced
    await h.act(() => mic.cb.onText?.("two"));
    expect(rename(h)).toMatchObject({ phase: "name", targetId: "t2" });
    expect(h.labelEdits).toEqual(["t2"]);

    await h.act(() => mic.cb.onText?.("approve"));
    await h.act(() => mic.cb.onText?.("invoice"));
    expect(h.session.voiceInterim).toBe("approve invoice");
    await h.act(() => { vi.advanceTimersByTime(FRAGMENT_SILENCE_MS - 1); });
    expect(label(h, "t2")).toBe("Check invoice");
    await h.act(() => { vi.advanceTimersByTime(1); });
    expect(label(h, "t2")).toBe("Approve invoice");
    expect(h.lastLine?.summary).toBe("renamed to “Approve invoice” — pick another or say “done”");

    // "3 pay the supplier" — a number in the pick phase flushes at once too.
    await h.act(() => mic.cb.onText?.("3 pay the supplier"));
    expect(label(h, "t3")).toBe("Pay the supplier");
  });

  it("from the mic: “cancel” closes the open flow through the runner; with nothing open it only clears", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const h = await mount(threeTasks());
    await h.act(() => h.session.toggleAbraListening());
    const mic = fakeDictation.current;
    await h.act(() => mic.cb.onText?.("rename tasks"));
    await h.act(() => mic.cb.onText?.("cancel"));
    expect(rename(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename finished", ok: true });
    await h.act(() => mic.cb.onText?.("cancel"));
    expect(h.lastLine).toMatchObject({ heard: "cancel", summary: "cleared — listening for the next command", ok: true });
    expect(aiCalls()).toHaveLength(0);
    expect(mic.stopped).toBe(false);
  });

  it("CURRENT: a SPOKEN “stop” ends the flow and the mic but writes no log line (a typed one says “stopped listening”)", async () => {
    // A quirk kept deliberately by the move: the mic's onText calls
    // stopAbraListening directly; only the runner's typed path logs it.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    const h = await mount(threeTasks());
    await h.act(() => h.session.toggleAbraListening());
    const mic = fakeDictation.current;
    await h.act(() => mic.cb.onText?.("rename tasks"));
    const before = h.log.length;
    await h.act(() => mic.cb.onText?.("stop"));
    expect(rename(h)).toBeNull();
    expect(mic.stopped).toBe(true);
    expect(h.session.voiceListening).toBe(false);
    expect(h.log).toHaveLength(before);
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("T5070 — the gold-flash toggle passes through; message by number; move dividers", () => {
  it("the gold-flash toggle passes through an open rename — in the pick AND the name phase — without closing it or becoming the name", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("turn off gold flashing");
    expect(h.lastLine).toMatchObject({ heard: "turn off gold flashing", summary: "gold flashing off", ok: true });
    expect(win.localStorage.getItem(GOLD_FLASH_KEY)).toBe("false");
    expect(rename(h)!.phase).toBe("pick");

    await h.typed("2");
    await h.typed("gold flashing on");
    expect(h.lastLine?.summary).toBe("gold flashing on — added, enclosed and moved items will flash");
    expect(win.localStorage.getItem(GOLD_FLASH_KEY)).toBe("true");
    expect(rename(h)).toMatchObject({ phase: "name", targetId: "t2" });
    expect(label(h, "t2")).toBe("Check invoice");
  });

  it("…and through an open message pick and an open “move dividers”", async () => {
    const m = await mount(twoPools());
    await m.typed("add a message");
    await m.typed("gold flashing off");
    expect(m.lastLine?.summary).toBe("gold flashing off");
    expect(message(m)).not.toBeNull();

    const d = await mount(twoLanes());
    await d.typed("move dividers");
    await d.typed("turn off gold flashing");
    expect(d.lastLine?.summary).toBe("gold flashing off");
    expect(dividers(d)).not.toBeNull();
  });

  it("CURRENT: inside the template window the gold-flash toggle is NOT let through — it is refused as a non-answer", async () => {
    // A quirk kept deliberately by the move: the pass-through checks only the
    // rename, message and divider flows, so the template window reads it.
    const h = await mount(threeTasks());
    await openTemplateWindow(h);
    await h.typed("turn off gold flashing");
    expect(h.lastLine).toMatchObject({ summary: "say a number, or “cancel”", ok: false });
    expect(win.localStorage.getItem(GOLD_FLASH_KEY)).toBeNull();
  });

  it("“add a message” numbers every end in reading order — the black-box pool last — or says why there is nothing to number", async () => {
    const h = await mount(twoPools());
    await h.typed("add a message");
    const f = message(h)!;
    expect(f.mode).toBe("pair");
    expect((f.targets as { id: string; n: number }[]).map((t) => [t.n, t.id])).toEqual([[1, "t1"], [2, "t2"], [3, "t3"], [4, "pool2"]]);
    expect(h.lastLine).toMatchObject({ summary: "numbers on everything a message can start or end at — say “<n> to <m> labelled <text>” (or “done”)", ok: true });

    const one = await mount(threeTasks());
    await one.typed("add a message");
    expect(message(one)).toBeNull();
    expect(one.lastLine).toMatchObject({ summary: "nothing here can exchange a message — a message runs between two pools", ok: false });
  });

  it("wrong answers keep the numbers up with their reason; “1 to 4” draws the message and closes the pick", async () => {
    const h = await mount(twoPools());
    await h.typed("add a message");
    await h.typed("hello");
    await h.typed("9 to 1");
    await h.typed("1 to 2");
    await h.typed("delete Pay supplier"); // a whole command is not an answer — and is not run
    expect(lines(h).slice(1)).toEqual([
      { heard: "hello", summary: "say “<n> to <m> labelled <text>” — or “done”", ok: false },
      { heard: "9 to 1", summary: "there’s no badge with that number", ok: false },
      { heard: "1 to 2", summary: "“Receive order” and “Check invoice” are in the same pool — join them with a sequence flow, not a message", ok: false },
      { heard: "delete Pay supplier", summary: "say “<n> to <m> labelled <text>” — or “done”", ok: false },
    ]);
    expect(message(h)).not.toBeNull();
    expect(messages(h)).toEqual([]);
    expect(label(h, "t3")).toBe("Pay supplier");

    await h.typed("1 to 4");
    expect(message(h)).toBeNull();
    expect(messages(h)).toHaveLength(1);
    expect(messages(h)[0]).toMatchObject({ from: "t1", to: "pool2" });
    expect(h.lastLine).toMatchObject({ heard: "1 to 4", summary: "added message Receive order → Supplier", ok: true });
    expect(aiCalls()).toHaveLength(0);
  });

  it("“1 to 4 labelled Order” draws the message with its label and closes the pick", async () => {
    // The label's CASE is compared loosely: it is messageTargets.ts's to decide
    // (today parseMessageAnswer lower-cases the answer before reading the label),
    // not the session's — a fix there must not break this suite.
    const h = await mount(twoPools());
    await h.typed("add a message");
    await h.typed("1 to 4 labelled Order");
    expect(messagesAnyCase(h)).toEqual([{ from: "t1", to: "pool2", label: "order" }]);
    expect(h.lastLine?.ok).toBe(true);
    expect(h.lastLine?.summary.toLowerCase()).toBe("added message “order” receive order → supplier");
    expect(message(h)).toBeNull();
  });

  it("“add a message to the selected” numbers the selection's counterparts and takes “to <n> labelled <text>”", async () => {
    const h = await mount(twoPools());
    await h.select(["t2"]);
    await h.typed("add a message to the selected");
    const f = message(h)!;
    expect(f).toMatchObject({ mode: "one", anchorId: "t2", dirs: { to: true, from: true } });
    expect((f.targets as { id: string }[]).map((t) => t.id)).toEqual(["pool2"]);
    expect(h.lastLine?.summary).toBe("numbers on what can exchange a message with Check invoice — say “to <n> labelled <text>” or “from <n> labelled <text>” (or “done”)");

    await h.typed("1 to 2");
    expect(h.lastLine).toMatchObject({ summary: "say “to <n> labelled <text>” or “from <n> labelled <text>” — or “done”", ok: false });
    await h.typed("to 1 labelled Invoice");
    expect(messagesAnyCase(h)).toEqual([{ from: "t2", to: "pool2", label: "invoice" }]);
    expect(message(h)).toBeNull();
  });

  it("“done” walks away from the message pick — nothing drawn", async () => {
    const h = await mount(twoPools());
    await h.typed("add a message");
    await h.typed("done");
    expect(message(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "done", summary: "message cancelled", ok: true });
    expect(messages(h)).toEqual([]);
  });

  it("“move dividers” numbers the divider; “1 down 50 pixels” moves the lane boundary 50px and the numbers stay up; “done” closes", async () => {
    const h = await mount(twoLanes());
    await h.typed("move dividers");
    expect(dividers(h)).toEqual({
      prompt: "1 divider numbered — say “<n> up 100 pixels”, “<n> down 2 tasks”… then “done”",
      order: ["divider:lane1|lane2"],
    });
    expect(h.lastLine).toMatchObject({ summary: "1 divider numbered — say “<n> up 100 pixels”, “<n> down 2 tasks”… then “done”", ok: true });

    await h.typed("1 down 50 pixels");
    expect(box(h, "lane1")).toEqual({ y: 0, height: 250 });
    expect(box(h, "lane2")).toEqual({ y: 250, height: 150 });
    expect(box(h, "pool1")).toEqual({ y: 0, height: 400 });
    expect(h.lastLine).toMatchObject({ heard: "1 down 50 pixels", summary: "1 → moved Manager's top boundary down 50px — another, or “done”", ok: true });
    expect(dividers(h)).not.toBeNull();

    await h.typed("done");
    expect(dividers(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "done", summary: "dividers closed", ok: true });
    expect(aiCalls()).toHaveLength(0);
  });

  it("an answer said in halves: a bare “one” is held for its way; an amount after an answer makes that move the amount IN ALL", async () => {
    const h = await mount(twoLanes());
    await h.typed("move dividers");
    await h.typed("one");
    expect(h.lastLine).toMatchObject({ summary: "1 — now “up …” or “down …”", ok: true });
    expect(box(h, "lane1").height).toBe(200);
    await h.typed("up 20 pixels");
    expect(box(h, "lane1")).toEqual({ y: 0, height: 180 });
    expect(h.lastLine?.summary).toBe("1 → moved Manager's top boundary up 20px — another, or “done”");

    const g = await mount(twoLanes());
    await g.typed("move dividers");
    await g.typed("one down");
    expect(box(g, "lane1").height).toBe(220);
    expect(g.lastLine?.summary).toBe("1 → moved Manager's top boundary down 20px — another, or “done”");
    await g.typed("fifty pixels");
    expect(box(g, "lane1").height).toBe(250);
    expect(g.lastLine?.summary).toBe("1 → moved Manager's top boundary down 30px (50px down in all) — another, or “done”");
  });

  it("a miss is explained and moves nothing; a whole new command closes the numbers and runs", async () => {
    const h = await mount(twoLanes());
    await h.typed("move dividers");
    await h.typed("5 up");
    await h.typed("banana");
    expect(lines(h).slice(1)).toEqual([
      { heard: "5 up", summary: "there’s only divider 1 — say “1 up 100 pixels”", ok: false },
      { heard: "banana", summary: "say “<n> up 100 pixels” or “<n> down 2 tasks” — or “done”", ok: false },
    ]);
    expect(box(h, "lane1").height).toBe(200);
    expect(dividers(h)).not.toBeNull();

    await h.typed("delete Approve order");
    expect(dividers(h)).toBeNull();
    expect(label(h, "t2")).toBeUndefined();
    expect(h.lastLine).toMatchObject({ heard: "delete Approve order", summary: "deleted Approve order", ok: true });
  });

  it("no dividers: says so and opens nothing; a typed “stop” closes an open one", async () => {
    const h = await mount(threeTasks());
    await h.typed("move dividers");
    expect(dividers(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ summary: "there are no lane dividers here — a pool needs two lanes (or a lane two sub-lanes)", ok: false });

    const d = await mount(twoLanes());
    await d.typed("move dividers");
    await d.typed("stop");
    expect(dividers(d)).toBeNull();
    expect(d.lastLine?.summary).toBe("stopped listening");
  });
});

// ═════════════════════════════════════════════════════════════════════════════

describe("T5071 — the template window's answers (the session's side) and Escape", () => {
  it("“add template” asks the editor to open the window — plain, after a named step, after the one selected step — and logs its reply; “before” is refused", async () => {
    const h = await mount(threeTasks(), { templateWindowReply: "12 templates — say a number" });
    await h.typed("add template");
    await h.typed("add template after Check invoice");
    await h.select(["t3"]);
    await h.typed("add template");
    expect(h.templateWindowOpens).toEqual([{}, { anchorId: "t2" }, { anchorId: "t3" }]);
    expect(h.lastLine).toMatchObject({ heard: "add template", summary: "12 templates — say a number", ok: true });

    await h.typed("add template before Check invoice");
    expect(h.templateWindowOpens).toHaveLength(3);
    expect(h.lastLine).toMatchObject({ summary: TEMPLATE_BEFORE_REFUSAL, ok: false });
    expect(aiCalls()).toHaveLength(0);
  });

  it("in the window: a number or a name shows that template, “after X” moves it — each reports its own line", async () => {
    const h = await mount(threeTasks());
    const rec = await openTemplateWindow(h);
    await h.typed("2");
    await h.typed("invoice approval");
    await h.typed("after Check invoice");
    expect(rec.picks).toEqual(["Customer onboarding", "Invoice approval"]);
    expect(rec.anchors).toEqual(["Check invoice"]);
    expect(lines(h)).toEqual([
      { heard: "2", summary: "showing Customer onboarding", ok: true },
      { heard: "invoice approval", summary: "showing Invoice approval", ok: true },
      { heard: "after Check invoice", summary: "now after Check invoice", ok: true },
    ]);
    expect(templateSide(h).templateFlow).not.toBeNull();
    expect(aiCalls()).toHaveLength(0);
  });

  it("“before X” is refused with TEMPLATE_BEFORE_REFUSAL, a non-answer and a “yes” with nothing showing are refused too — the window stays open", async () => {
    const h = await mount(threeTasks());
    const rec = await openTemplateWindow(h);
    await h.typed("before Check invoice");
    await h.typed("banana split");
    await h.typed("yes");
    expect(lines(h)).toEqual([
      { heard: "before Check invoice", summary: TEMPLATE_BEFORE_REFUSAL, ok: false },
      { heard: "banana split", summary: "say a number, or “cancel”", ok: false },
      { heard: "yes", summary: "say a number, or “cancel”", ok: false },
    ]);
    expect(rec).toEqual({ closes: [], picks: [], anchors: [] });
    expect(templateSide(h).templateFlow).not.toBeNull();
    expect(aiCalls()).toHaveLength(0);
  });

  it("“cancel” closes the window without keeping; “yes” with a template showing keeps it — each logs the editor's reply", async () => {
    const h = await mount(threeTasks());
    const rec = await openTemplateWindow(h);
    await h.typed("cancel");
    expect(rec.closes).toEqual([false]);
    expect(h.lastLine).toMatchObject({ heard: "cancel", summary: "templates closed", ok: true });
    expect(templateSide(h).templateFlow).toBeNull();

    const rec2 = await openTemplateWindow(h, { showing: true });
    await h.typed("yes");
    expect(rec2.closes).toEqual([true]);
    expect(h.lastLine).toMatchObject({ heard: "yes", summary: "kept the template", ok: true });
  });

  it("“scroll down” moves the window's list by most of a page; at the top “scroll up” says so; with no list yet it asks for a number", async () => {
    const h = await mount(threeTasks());
    await openTemplateWindow(h);
    await h.typed("scroll down");
    expect(h.lastLine).toMatchObject({ summary: "the template window isn't showing its list yet — say a number", ok: false });

    const list = { scrollTop: 0, scrollHeight: 1000, clientHeight: 400, scrollTo: vi.fn() };
    templateSide(h).templateScrollRef.current = list;
    await h.typed("scroll down");
    expect(list.scrollTo).toHaveBeenCalledWith({ top: 340, behavior: "smooth" });
    expect(h.lastLine).toMatchObject({ summary: "scrolled down — say a number", ok: true });
    await h.typed("scroll up");
    expect(list.scrollTo).toHaveBeenCalledTimes(1);
    expect(h.lastLine).toMatchObject({ summary: "already at the top — say a number, or “scroll down”", ok: true });
  });

  it("CURRENT: a typed “stop” does not close the template window (it closes rename, message, dividers, a waiting confirmation and the “which one?” pick)", async () => {
    // A quirk kept deliberately by the move: stopAbraListening clears the
    // rename, message and divider flows, a parked confirmation and (since
    // Paul's ruling of 2026-09-29) the "which one?" pick — not the template
    // window, which his rulings did not name.
    const h = await mount(threeTasks());
    const rec = await openTemplateWindow(h);
    await h.typed("stop");
    expect(h.lastLine).toMatchObject({ heard: "stop", summary: "stopped listening", ok: true });
    expect(templateSide(h).templateFlow).not.toBeNull();
    expect(rec.closes).toEqual([]);
  });

  it("Escape with nothing open does nothing", async () => {
    const h = await mount(threeTasks());
    await h.act(() => win.pressEscape());
    expect(h.log).toEqual([]);
  });

  it("Escape closes the rename flow (mid-name) with “rename cancelled”, leaving the name alone — and the listener goes with it", async () => {
    const h = await mount(threeTasks());
    await h.typed("rename tasks");
    await h.typed("2");
    await h.act(() => win.pressEscape());
    expect(rename(h)).toBeNull();
    expect(h.lastLine).toMatchObject({ heard: "", summary: "rename cancelled", ok: true });
    expect(label(h, "t2")).toBe("Check invoice");
    const n = h.log.length;
    await h.act(() => win.pressEscape());
    expect(h.log).toHaveLength(n);
  });

  it("Escape closes the message pick (“message cancelled”) and “move dividers” (“dividers closed”)", async () => {
    const m = await mount(twoPools());
    await m.typed("add a message");
    await m.act(() => win.pressEscape());
    expect(message(m)).toBeNull();
    expect(m.lastLine).toMatchObject({ heard: "", summary: "message cancelled", ok: true });
    await unmountNow(m);

    const d = await mount(twoLanes());
    await d.typed("move dividers");
    await d.act(() => win.pressEscape());
    expect(dividers(d)).toBeNull();
    expect(d.lastLine).toMatchObject({ heard: "", summary: "dividers closed", ok: true });
  });

  it("Escape closes the picker (“cancelled”, nothing deleted) and the template window (the editor's close, not kept, its reply logged)", async () => {
    const p = await mount(twoSameNames());
    await p.typed("delete Check invoice");
    expect(p.session.pickFlow).not.toBeNull();
    expect(p.lastLine?.summary).toBe("which “Check invoice”? say a number (1–2), or “cancel”");
    await p.act(() => win.pressEscape());
    expect(p.session.pickFlow).toBeNull();
    expect(p.lastLine).toMatchObject({ heard: "", summary: "cancelled", ok: true });
    expect(p.data.elements.filter((e) => e.label === "Check invoice")).toHaveLength(2);
    await unmountNow(p);

    const t = await mount(threeTasks());
    const rec = await openTemplateWindow(t);
    await t.act(() => win.pressEscape());
    expect(rec.closes).toEqual([false]);
    expect(templateSide(t).templateFlow).toBeNull();
    expect(t.lastLine).toMatchObject({ heard: "", summary: "templates closed", ok: true });
  });
});
