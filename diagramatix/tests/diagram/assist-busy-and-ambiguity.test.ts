/**
 * T4565-T4567 — B4, R3 and R2.
 *
 * B4  The voice path was never gated on busy. Two sentences spoken over one AI
 *     call both applied against the state from BEFORE the call, and their log
 *     lines interleaved. The text box has been gated since b00e3c7b.
 *
 * R3  A bare type noun resolves to the MOST RECENT of its kind — right for
 *     "add a task after the gateway", quietly wrong for "delete the task",
 *     which removed the newest and reported success. The inconsistency was
 *     visible in the product: "delete the lane" already asked which.
 *
 * R2  `resolveRef` has always returned the candidate list on an ambiguity, and
 *     the editor threw it away and said only "is ambiguous" — leaving the user
 *     to guess what it had found.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";
import { editorWithApplyLayer } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const editor = () => editorWithApplyLayer();

const el = (id: string, type: string, label: string): DiagramElement =>
  ({ id, type, label, x: 0, y: 0, width: 100, height: 60, properties: {} }) as unknown as DiagramElement;

const twoTasks = [el("t1", "task", "Review"), el("t2", "task", "Approve")];
const twoPools = [el("p1", "pool", "Customer"), el("p2", "pool", "Supplier")];

describe("T4565 — R3: a destructive command does not guess", () => {
  it("still takes the most recent for an ordinary command", () => {
    // The convenience that makes "add a task after the gateway" quick.
    const r = resolveRef("the task", twoTasks, null, []);
    expect(r).toEqual({ id: "t2" });
  });

  it("reports the candidates instead, under strict", () => {
    const r = resolveRef("the task", twoTasks, null, [], { strict: true });
    expect(r).toEqual({ ambiguous: ["t1", "t2"] });
  });

  it("applies to bare container nouns too", () => {
    expect(resolveRef("the pool", twoPools, null, [])).toEqual({ id: "p2" });
    expect(resolveRef("the pool", twoPools, null, [], { strict: true }))
      .toEqual({ ambiguous: ["p1", "p2"] });
  });

  it("does not interfere when there is only one candidate", () => {
    // Strictness is about refusing to CHOOSE, not about refusing to answer.
    const one = [el("t1", "task", "Review")];
    expect(resolveRef("the task", one, null, [], { strict: true })).toEqual({ id: "t1" });
  });

  it("leaves a named reference alone", () => {
    // "delete Review" is not a guess — it is an instruction.
    expect(resolveRef("Review", twoTasks, null, [], { strict: true })).toEqual({ id: "t1" });
  });

  it("is what the delete op asks for", () => {
    expect(editor()).toContain("resolve1(op.ref, { strict: true })");
  });
});

describe("T4566 — R2: an ambiguity names what it found", () => {
  it("lists the candidates rather than saying only 'is ambiguous'", () => {
    const body = editor();
    expect(body).toContain("which “${ref}”?");
    expect(body, "the labels, so the user can pick one").toContain("(e.label ?? \"\").trim() || e.type");
    expect(body, "and a way forward").toContain("say the name");
  });

  it("does not print a hundred names at a shout", () => {
    const body = editor();
    expect(body).toContain("names.slice(0, 4)");
    expect(body).toContain("and ${names.length - 4} more");
  });

  it("keeps the selection message, which is a different problem", () => {
    // Too MANY selected is not "which one do you mean" — it is "select fewer".
    expect(editor()).toContain("elements are selected — select just one for that");
  });
});

describe("T4567 — B4: the voice path waits its turn", () => {
  const body = editor();

  it("gates on a REF, which flips synchronously", () => {
    // React state is not true until the next render — far too late to stop the
    // next utterance, which arrives whenever the speaker pauses for breath.
    expect(body).toContain("const voiceBusyRef = useRef(false)");
    expect(body).toContain("voiceBusyRef.current = true;");
    expect(body).toContain("voiceBusyRef.current = false;");
  });

  it("queues what is spoken during a call instead of racing it — and behind a queue still draining", () => {
    expect(body).toContain("voiceQueueRef.current.push(heard)");
    expect(body).toContain("waiting for the previous command");
    // The drain waits for a render (below), so a sentence arriving in that gap
    // must join the back of the queue, not jump it; the head being drained is
    // the one command that goes straight through.
    expect(body).toContain("if (!fromQueue && (voiceBusyRef.current || voiceQueueRef.current.length > 0)) {");
  });

  it("drains the queue AFTER the call's render, one command per render", () => {
    // Changed by design 2026-09-26: the finally used to run the next command in
    // the same tick, before anything rendered — so it resolved against the
    // diagram from BEFORE the call, and the voice-debug recording folded both
    // commands into one "after". The finally now only wakes the drain effect.
    const fin = body.slice(body.indexOf("voiceBusyRef.current = false;"));
    const finBlock = fin.slice(0, fin.indexOf("}, [applyGrouped, appendLog, data.elements, data.connectors]);"));
    expect(finBlock).toContain("if (voiceQueueRef.current.length > 0) setVoiceDrainTick((n) => n + 1);");
    expect(finBlock, "never the next command inside the call that finished").not.toContain("runAbraCommandRef");
    const drain = body.slice(body.indexOf("if (voiceBusyRef.current) return;"));
    const effect = drain.slice(0, drain.indexOf("}, [voiceDrainTick]);"));
    expect(effect.length, "the drain effect is there").toBeGreaterThan(0);
    expect(effect).toContain("const next = voiceQueueRef.current.shift();");
    expect(effect).toContain("if (next !== undefined) void runAbraCommandRef.current(next, true);");
    // A queued command handled on the spot finishes no call, so nothing else
    // would wake the one behind it.
    expect(effect).toContain("if (!voiceBusyRef.current && voiceQueueRef.current.length > 0) setVoiceDrainTick((n) => n + 1);");
  });

  it("drains through the REF, so the queued command sees the NEW diagram", () => {
    // Draining through this closure would replay the queued command against the
    // diagram as it was when it was spoken — the very bug being fixed.
    const drain = body.slice(body.indexOf("const next = voiceQueueRef.current.shift();"));
    expect(drain.slice(0, 200)).toContain("runAbraCommandRef.current");
    expect(drain.slice(0, 200)).not.toContain("void runVoiceCommand(next");
    // The ref is reassigned during the render, so the effect reads it after.
    expect(body.indexOf("runAbraCommandRef.current = runVoiceCommand;")).toBeLessThan(body.indexOf("const next = voiceQueueRef.current.shift();"));
  });

  it("lets 'stop' through immediately, and drops what is parked", () => {
    // The brake must never queue behind the thing it is trying to stop.
    const stop = body.slice(body.indexOf("if (isMicStopWord(heard))"));
    const clear = stop.indexOf("voiceQueueRef.current = []");
    const guard = body.indexOf("if (!fromQueue && (voiceBusyRef.current || voiceQueueRef.current.length > 0)) {");
    expect(guard, "the queue guard is there").toBeGreaterThan(-1);
    expect(clear).toBeGreaterThan(-1);
    expect(body.indexOf("if (isMicStopWord(heard))"), "stop is checked BEFORE the queue guard")
      .toBeLessThan(guard);
  });

  it("still tells the bar it is busy, so the text box stays gated", () => {
    expect(body).toContain("setVoiceBusy(true)");
    expect(body).toContain("busy={voiceBusy}");
  });
});
