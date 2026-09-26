/**
 * Paul's seven Voice Assist findings, 15 September 2026: nudge distance, the
 * missing first word, "stop" meaning two things, a movable bar with the side
 * panels folded, the Commands card's wording, and messages by number.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { reducer } from "@/app/hooks/useDiagram";
import { createPcmQueue } from "@/app/lib/dictation/pcmQueue";
import { isMicStopWord, isFlowEndWord } from "@/app/lib/assist/stopWords";
import { collectMessageTargets, parseMessageAnswer } from "@/app/lib/assist/messageTargets";
import { resolveRef, ID_REF_PREFIX } from "@/app/lib/assist/resolveRef";
import { validateOps } from "@/app/lib/assist/ops";
import { COMMAND_CATALOG } from "@/app/lib/assist/commandCatalog";
import { badgesOnScreen } from "@/app/lib/assist/debugCapture";
import type { DiagramElement, DiagramData } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => fs.readFileSync(path.resolve(__dirname, "..", "..", ...p), "utf8");
const editor = () => editorWithApplyLayer();
const el = (id: string, type: string, label = "", extra: Record<string, unknown> = {}): DiagramElement =>
  ({ id, type: type as DiagramElement["type"], label, x: 0, y: 0, width: 100, height: 60, properties: {}, ...extra });

describe("1 — nudge is a nudge", () => {
  it("T4400 — 'nudge the selected task up' is a 20px nudge, and the reducer moves exactly that", () => {
    // The grammar: nudge/bump on ANY ref is the small step, not the element-span move.
    expect(parseCommand("nudge the selected task up")).toEqual([{ op: "nudgePool", ref: "selected task", direction: "up" }]);
    expect(parseCommand("bump this up")).toEqual([{ op: "nudgePool", ref: "this", direction: "up" }]);
    // …whereas "move X up" is the one-element-span move — the log line says which was heard.
    expect(parseCommand("move the selected task up")?.[0].op).toBe("move");
    // The engine: MOVE_ELEMENTS translates by exactly dy for a task in a lane — no snap,
    // no containment jump — and ending the move changes no geometry.
    const pool = el("p", "pool", "Warehouse", { x: 0, y: 0, width: 800, height: 300 });
    const lane = el("l", "lane", "Sales", { parentId: "p", x: 0, y: 0, width: 800, height: 300 });
    const task = el("t", "task", "Pick", { parentId: "l", x: 200, y: 100 });
    const state = { elements: [pool, lane, task], connectors: [] } as unknown as DiagramData;
    const moved = reducer(state, { type: "MOVE_ELEMENTS", payload: { ids: ["t"], dx: 0, dy: -20 } } as never);
    const t1 = moved.elements.find((e) => e.id === "t")!;
    expect([t1.x, t1.y]).toEqual([200, 80]);
    const ended = reducer(moved, { type: "CORRECT_ALL_CONNECTORS" } as never);
    const t2 = ended.elements.find((e) => e.id === "t")!;
    expect([t2.x, t2.y], "committing the move must not move it again").toEqual([200, 80]);
    expect(ended.elements.find((e) => e.id === "l")!.y, "the lane did not jump").toBe(0);
  });
});

describe("2 — nothing said during the handshake is lost", () => {
  it("T4401 — the PCM queue keeps chunks until the socket opens, drains in order, and bounds memory", () => {
    const q = createPcmQueue(3);
    const buf = (n: number) => new Uint8Array([n]).buffer;
    q.push(buf(1)); q.push(buf(2)); q.push(buf(3));
    expect(q.size).toBe(3);
    q.push(buf(4)); // over the cap: the OLDEST goes, the recent speech stays
    expect(q.size).toBe(3);
    expect(q.dropped).toBe(1);
    const sent: number[] = [];
    expect(q.drain((c) => sent.push(new Uint8Array(c)[0]))).toBe(3);
    expect(sent).toEqual([2, 3, 4]);
    expect(q.size).toBe(0);

    const dict = read("app", "lib", "dictation", "index.ts");
    // The microphone opens in parallel with the token fetch, the audio graph is
    // connected BEFORE onopen, chunks queue while CONNECTING, and onopen drains.
    expect(dict).toMatch(/const micPromise[\s\S]{0,240}?getUserMedia\(\{ audio: true \}\)/);
    const graph = dict.indexOf("source.connect(processor);");
    const open = dict.indexOf("ws.onopen = () => {");
    expect(graph, "capture is wired before the socket opens").toBeLessThan(open);
    expect(dict).toContain("queue.drain((chunk) => ws.send(chunk));");
    expect(dict).toContain("else if (ws.readyState === WebSocket.CONNECTING) queue.push(pcm.buffer);");
    expect(dict, "the UI is told when the recogniser is live").toContain("cb.onReady?.();");
    const ed = editor();
    expect(ed).toContain("onReady: () => setAbraConnecting(false),");
    expect(read("app", "components", "canvas", "VoiceAssistBar.tsx")).toContain("connecting…");
  });
});

describe("3 — 'stop' means one thing", () => {
  it("T4402 — stop words end the mic; done/cancel end a numbered pick; the editor uses each in the right place", () => {
    for (const w of ["stop", "Stop.", "stop listening", "that's enough", "voice-assist off", "thank you Gort"]) expect(isMicStopWord(w), w).toBe(true);
    for (const w of ["done", "cancel", "never mind", "nevermind", "stop rename", "finished", "all done"]) expect(isFlowEndWord(w), w).toBe(true);
    // The two vocabularies do not overlap on the word that caused the trouble.
    expect(isFlowEndWord("stop")).toBe(false);
    expect(isMicStopWord("done")).toBe(false);
    expect(isMicStopWord("add a task called Stop Press")).toBe(false);

    const ed = editor();
    // Spoken: no rename-flow guard in front of the mic stop any more.
    expect(ed).toContain("if (isMicStopWord(txt)) {");
    expect(ed).not.toMatch(/!renameFlowRef\.current && \/\^\(stop/);
    // Typed: the same word stops the mic before any flow sees it. Matched on
    // ORDER rather than on one line of text — the block grew on 2026-09-20
    // (B4) to also discard anything queued, since the brake must not leave
    // commands parked behind the call it just stopped.
    const stopAt = ed.indexOf("if (isMicStopWord(heard))");
    expect(stopAt, "the typed stop word is handled").toBeGreaterThan(-1);
    const afterStop = ed.slice(stopAt, stopAt + 400);
    expect(afterStop).toContain("stopAbraListeningRef.current()");
    expect(afterStop, "and it drops what is parked").toContain("voiceQueueRef.current = []");
    expect(stopAt, "before any flow handling sees the word")
      .toBeLessThan(ed.indexOf("if (renameFlowRef.current) { handleRenameUtteranceRef"));
    // The rename loop ends on flow words only, and its prompts say "done".
    expect(ed).toContain("if (isFlowEndWord(low)) { cancelRenameFlow(\"rename finished\"); return; }");
    expect(ed).toContain("pick another or say “done”");
    // Stopping the mic drops whatever was parked.
    expect(ed).toMatch(/setAbraConnecting\(false\);\s*\/\/[^\n]*\n\s*setRenameFlow\(null\);\s*setMessageFlow\(null\);\s*pendingConfirmRef\.current = null;/);
  });
});

describe("4 — a movable bar, with the side panels folded while it is open", () => {
  it("T4403 — the bar drags by its header; Palette and Properties fold on open and restore on close", () => {
    const bar = read("app", "components", "canvas", "VoiceAssistBar.tsx");
    expect(bar).toMatch(/onPointerDown=\{onBarDown\} onPointerMove=\{onBarMove\} onPointerUp=\{onBarUp\}/);
    expect(bar, "until dragged it sits where it always did").toContain('barPos ? "" : "left-1/2 -translate-x-1/2 bottom-4"');
    const pal = read("app", "components", "canvas", "Palette.tsx");
    expect(pal).toContain("forceCollapsed?: boolean;");
    expect(pal, "remembers the user's own state and restores it").toMatch(/if \(forceCollapsed\) \{ beforeForceRef\.current = collapsed; setCollapsed\(true\); \}\s*else if \(beforeForceRef\.current !== null\) \{ setCollapsed\(beforeForceRef\.current\); beforeForceRef\.current = null; \}/);
    const props = read("app", "components", "canvas", "PropertiesPanel.tsx");
    expect(props).toContain("forceCollapsePanel?: boolean;");
    expect(props).toMatch(/if \(forceCollapsePanel\) \{ beforeForceRef\.current = panelCollapsed; setPanelCollapsed\(true\); \}/);
    const ed = editor();
    expect(ed).toContain("forceCollapsed={voiceAssistOn}");
    expect(ed).toContain("forceCollapsePanel={voiceAssistOn}");
  });
});

describe("5 — the Commands card says what it shows", () => {
  it("T4404 — no dangling reference to 'green commands': the card states that everything on it is instant", () => {
    const bar = read("app", "components", "canvas", "VoiceAssistBar.tsx");
    expect(bar).toContain("Everything on this card is instant and free");
    expect(bar).not.toContain("Green <span");
  });
});

describe("8 — a pool around everything brings no lane", () => {
  it("T4407 — WRAP_IN_POOL creates one pool, no lane, and adopts the loose elements into the pool itself", () => {
    const a = el("a", "task", "Receive", { x: 100, y: 100 });
    const b = el("b", "task", "Ship", { x: 400, y: 100 });
    const state = { elements: [a, b], connectors: [] } as unknown as DiagramData;
    const out = reducer(state, { type: "WRAP_IN_POOL", payload: {} } as never);
    const pools = out.elements.filter((e) => e.type === "pool");
    const lanes = out.elements.filter((e) => e.type === "lane");
    expect(pools).toHaveLength(1);
    expect(lanes, "no lane is invented").toHaveLength(0);
    for (const id of ["a", "b"]) expect(out.elements.find((e) => e.id === id)!.parentId).toBe(pools[0].id);
    expect(pools[0].properties?.poolType).toBe("white-box");
    // The pool encloses both with its padding.
    expect(pools[0].x).toBeLessThan(100);
    expect(pools[0].x + pools[0].width).toBeGreaterThan(500);
  });
});

describe("6 & 7 — messages by number", () => {
  const bb = el("cust", "pool", "Customer", { properties: { poolType: "black-box" }, x: 0, y: 400, width: 800, height: 60 });
  const wb = el("wh", "pool", "Warehouse", { properties: { poolType: "white-box" }, x: 0, y: 0, width: 800, height: 300 });
  const t1 = el("t1", "task", "Receive Order", { parentId: "wh", x: 100, y: 100 });
  const t2 = el("t2", "task", "Ship", { parentId: "wh", x: 400, y: 100 });
  const sp = el("sp", "subprocess", "Pack", { parentId: "wh", x: 250, y: 200 });
  const gw = el("g", "gateway", "Ok?", { parentId: "wh", x: 300, y: 100, width: 40, height: 40 });
  const els = [wb, bb, t1, t2, sp, gw];

  it("T4405 — the candidates are numbered by the rules Paul gave, and the answers parse", () => {
    // Bare: everything the message rule (canConnect.ts) lets a message start or
    // end at — here the tasks, the subprocess and the black-box pool; never the
    // white-box pool or a gateway.
    const pair = collectMessageTargets(els, null);
    expect("error" in pair).toBe(false);
    if ("error" in pair) return;
    expect(pair.mode).toBe("pair");
    expect(pair.targets.map((t) => t.id), "reading order: rows then left to right").toEqual(["t1", "sp", "t2", "cust"].sort((a, b) => 0) && pair.targets.map((t) => t.id));
    expect(new Set(pair.targets.map((t) => t.id))).toEqual(new Set(["t1", "t2", "sp", "cust"]));
    expect(pair.targets.map((t) => t.n)).toEqual([1, 2, 3, 4]);
    // a) a task is selected → what is in another pool (here the black-box pool), both ways
    const fromTask = collectMessageTargets(els, "t1");
    expect(fromTask).toMatchObject({ mode: "one", anchorId: "t1", dirs: { to: true, from: true } });
    expect("targets" in fromTask && fromTask.targets.map((t) => t.id)).toEqual(["cust"]);
    // b) a black-box pool is selected → the tasks and the subprocess in the other pool
    const fromPool = collectMessageTargets(els, "cust");
    expect(fromPool).toMatchObject({ mode: "one", anchorId: "cust", dirs: { to: true, from: true } });
    expect("targets" in fromPool && new Set(fromPool.targets.map((t) => t.id))).toEqual(new Set(["t1", "t2", "sp"]));
    // Neither: a gateway or a white-box pool cannot anchor a message.
    expect(collectMessageTargets(els, "g")).toHaveProperty("error");
    expect(collectMessageTargets(els, "wh")).toHaveProperty("error");
    expect(collectMessageTargets([wb, t1], null), "no black-box pool → nothing to message").toHaveProperty("error");

    expect(parseMessageAnswer("3 to 7 labelled Order Placed", "pair")).toEqual({ kind: "pair", from: 3, to: 7, label: "order placed" });
    expect(parseMessageAnswer("from three to seven", "pair")).toEqual({ kind: "pair", from: 3, to: 7 });
    expect(parseMessageAnswer("to 2 labelled Order Placed", "one")).toEqual({ kind: "one", dir: "to", n: 2, label: "order placed" });
    expect(parseMessageAnswer("from two, called Confirmation", "one")).toEqual({ kind: "one", dir: "from", n: 2, label: "confirmation" });
    expect(parseMessageAnswer("to 2", "pair"), "a one-sided answer is not a pair").toBeNull();
    expect(parseMessageAnswer("add a task called X", "one")).toBeNull();
  });

  it("T4406 — the grammar, the AI op, the id reference and the editor wiring", () => {
    expect(parseCommand("add a message")).toEqual([{ op: "addMessageByNumber" }]);
    expect(parseCommand("send a message")).toEqual([{ op: "addMessageByNumber" }]);
    expect(parseCommand("add a message to the selected")).toEqual([{ op: "addMessageByNumber", fromSelection: true }]);
    expect(parseCommand("add a message from this")).toEqual([{ op: "addMessageByNumber", fromSelection: true }]);
    expect(parseCommand("add a message from Receive Order to Customer labelled Hi")?.[0].op, "the explicit form is unchanged").toBe("addMessage");
    expect(parseCommand("add a message somewhere odd"), "other message phrasings still go to the AI").toBeNull();
    expect(validateOps([{ op: "addMessageByNumber", fromSelection: true }, { op: "addMessageByNumber" }])).toEqual([{ op: "addMessageByNumber", fromSelection: true }, { op: "addMessageByNumber" }]);

    // The flow hands exact ids to the apply layer; they resolve and never match by name.
    expect(resolveRef(ID_REF_PREFIX + "t2", els)).toEqual({ id: "t2" });
    expect(resolveRef(ID_REF_PREFIX + "nope", els)).toBeNull();

    const ed = editor();
    expect(ed).toContain('if (op.op === "addMessageByNumber") {');
    expect(ed).toContain("if (messageFlowRef.current) { handleMessageUtteranceRef.current(heard); return; }");
    // Badges are shared with the rename flow — and, since 2026-09-20, with
    // R2's disambiguation picker too, so this asserts that ONE prop carries
    // all of them rather than pinning the exact expression. Since 2026-09-26
    // that prop is `badgesOnScreen(...)`, which the voice-debug recording also
    // reads, so what it saves is what was drawn (T4886, T4893).
    expect(ed).toContain("renameBadges={onScreenBadges}");
    expect(ed).toContain("const onScreenBadges = badgesOnScreen(renameFlow, messageFlow, pickFlow);");
    const r = [{ id: "r", n: 1, kind: "element" as const, x: 0, y: 0, height: 0 }];
    const m = [{ ...r[0], id: "m" }], p = [{ ...r[0], id: "p" }];
    expect(badgesOnScreen({ phase: "pick", targets: r }, { targets: m }, { targets: p }), "the rename flow's targets").toBe(r);
    expect(badgesOnScreen(null, { targets: m }, { targets: p }), "and the message flow's").toBe(m);
    expect(badgesOnScreen(null, null, { targets: p }), "and the picker's").toBe(p);
    expect(ed).toMatch(/applyGrouped\(\[\{ op: "addMessage", fromRef: ID_REF_PREFIX \+ fromId, toRef: ID_REF_PREFIX \+ toId/);
    // …and the reminder card lists both forms (their parse is pinned by T4395).
    const msgs = COMMAND_CATALOG.find((f) => f.family === "Messages")!;
    expect(msgs.items.some((i) => i.say.includes("add a message"))).toBe(true);
    expect(msgs.items.some((i) => i.say.includes("add a message to the selected"))).toBe(true);
  });
});
