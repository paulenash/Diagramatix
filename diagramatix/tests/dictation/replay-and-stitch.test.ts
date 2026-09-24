/**
 * T4734–T4736 — replaying the corpus through the real recogniser.
 *
 * Phase 5. The stream leg is the one that actually answers Paul's question,
 * because the live path is raw Int16 into a socket and nothing about that socket
 * needs a microphone at the other end: a stored clip can go back through the
 * identical socket, with the identical settings, stitched by the identical
 * policy.
 *
 * The batch leg is a cheap fallback and is labelled as one — in the UI, next to
 * its own number, because a green batch result read as a green live result is
 * exactly the misreading this harness exists to prevent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  stitchFinals, FRAGMENT_SILENCE_MS, FRAGMENT_CONTINUE_MS, FRAGMENT_MAX_WAITS,
} from "@/app/lib/assist/fragmentBuffer";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";

const read = (p: string) => readFileSync(p, "utf8");

describe("T4734 — fragments stitch back into one command", () => {
  it("a pause inside a sentence does not split the command", () => {
    // Paul's case: "rename Task 8 to" … pause … "Approve". Running the first
    // half renames nothing and loses the second, so the buffer holds while
    // `isIncompleteCommand` says the sentence is unfinished.
    expect(isIncompleteCommand("rename Task 8 to"), "the predicate agrees it is unfinished").toBe(true);
    const out = stitchFinals([
      { text: "rename Task 8 to", atMs: 0 },
      { text: "Approve", atMs: 2600 },      // past SILENCE, inside the CONTINUE grace
    ], 5200);
    expect(out).toEqual(["rename Task 8 to Approve"]);
  });

  it("two complete commands with a real gap stay two commands", () => {
    const out = stitchFinals([
      { text: "delete Review", atMs: 0 },
      { text: "add a task called Approve", atMs: 4000 },
    ], 7000);
    expect(out).toEqual(["delete Review", "add a task called Approve"]);
  });

  it("a short gap joins them, because that is one sentence said unevenly", () => {
    const out = stitchFinals([
      { text: "add a task", atMs: 0 },
      { text: "called Approve", atMs: 900 },
    ], 3500);
    expect(out).toEqual(["add a task called Approve"]);
  });

  it("gives up after the hold budget rather than waiting for ever", () => {
    // An unfinished sentence nobody finishes must still run (and fail visibly),
    // not sit in a buffer silently swallowing everything after it.
    const gap = FRAGMENT_SILENCE_MS + FRAGMENT_CONTINUE_MS * (FRAGMENT_MAX_WAITS + 2);
    const out = stitchFinals([
      { text: "rename Task 8 to", atMs: 0 },
      { text: "delete Review", atMs: gap },
    ], gap + 4000);
    expect(out, "the half command runs on its own").toEqual(["rename Task 8 to", "delete Review"]);
  });

  it("always flushes what is left when the audio stops", () => {
    // stopAbraListening and the socket's onEnd both force a flush; a clip that
    // ends mid-buffer must not lose its command.
    expect(stitchFinals([{ text: "delete Review", atMs: 0 }], 100)).toEqual(["delete Review"]);
    expect(stitchFinals([], 1000), "nothing said, nothing run").toEqual([]);
    expect(stitchFinals([{ text: "   ", atMs: 0 }], 3000), "empty finals are not commands").toEqual([]);
  });
});

describe("T4735 — the live path and the replay share the numbers", () => {
  it("the editor imports the constants rather than declaring its own", () => {
    // The honest scope of the sharing: the two agree on how long to wait and on
    // when a sentence looks unfinished — the parts that would actually drift.
    // They remain two implementations of the loop, because unifying them means
    // rewriting the live timer state machine, which is the riskiest code in
    // this feature and currently works. That trade is written down in
    // fragmentBuffer.ts rather than left for somebody to discover.
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("const ABRA_SILENCE_MS = FRAGMENT_SILENCE_MS;");
    expect(editor).toContain("const ABRA_CONTINUE_MS = FRAGMENT_CONTINUE_MS;");
    expect(editor).toContain("const ABRA_MAX_WAITS = FRAGMENT_MAX_WAITS;");
    expect(editor, "no literal may creep back in").not.toMatch(/ABRA_SILENCE_MS = \d/);
    expect(editor).not.toMatch(/ABRA_CONTINUE_MS = \d/);

    const buf = read("app/lib/assist/fragmentBuffer.ts");
    expect(buf, "and the limit of the sharing is stated, not implied").toMatch(/two implementations/i);
  });

  it("both sides use the same unfinished-sentence predicate", () => {
    const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(editor).toContain("isIncompleteCommand(cmd)");
    expect(read("app/lib/assist/fragmentBuffer.ts")).toContain("isIncompleteCommand(buffer.trim())");
  });
});

describe("T4736 — the replay measures the live path, and says where it cannot", () => {
  const replay = () => read("app/lib/dictation/replayClip.ts");

  it("uses the same socket, the same settings and the same stitching", () => {
    const src = replay();
    expect(src, "the live builder, not a second parameter list").toContain("liveStreamParams({ sampleRate: decoded.sampleRate");
    expect(src).toContain("wss://api.deepgram.com/v1/listen");
    expect(src, "stitched by the shared policy").toContain("stitchFinals(finals");
    expect(src, "only is_final counts — interims are not what the editor runs").toContain("msg.is_final");
  });

  it("is paced in real time, because endpointing is wall-clock", () => {
    // Blasting five seconds down the wire in fifty milliseconds would finalise
    // everything as one segment, and the fragment behaviour — a real failure
    // mode with its own test file — would be invisible.
    const src = replay();
    expect(src).toContain("const frameMs = (FRAME_SAMPLES / sampleRate) * 1000");
    expect(src).toContain("await sleep(frameMs)");
    expect(src, "and a stuck socket cannot hang a hundred-clip run").toMatch(/timeoutMs \?\? 30_000/);
  });

  it("never throws — a replay failure is a row in a table", () => {
    const src = replay();
    expect(src).toContain("Not a 16-bit mono PCM WAV.");
    expect(src, "org policy and a missing key are states, not exceptions")
      .toContain("Voice AI is not allowed for this org.");
  });

  it("the batch leg's blind spots are printed beside its own number", () => {
    // In the UI, not in a document nobody opens: the only reliable way to stop
    // a green batch result being read as a green live result.
    const panel = read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx");
    expect(panel).toContain("A green number here is not a green live number.");
    expect(panel, "segmentation is the one that matters most").toMatch(/segmentation/i);
    expect(panel).toMatch(/streaming vs pre-recorded/i);
    expect(panel).toMatch(/command queue/i);
  });

  it("scores the FIRST stitched utterance, not the concatenation", () => {
    // If the buffer would have produced two commands, the first one is what the
    // sentence actually became. Scoring the join would hide the split, which is
    // precisely the failure the stream leg exists to catch.
    expect(read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx"))
      .toContain("transcript = r.utterances[0] ?? \"\"");
  });

  it("replays the LATEST take, and merges results by caseId", () => {
    const panel = read("app/(dashboard)/dashboard/admin/voice-assist-test/ReplayPanel.tsx");
    expect(panel, "a retake exists because the earlier one was worse").toContain("c.takeNumber > prev.takeNumber");
    expect(panel, "never by index — clips can fail or be skipped").toContain("[clip.caseId]: result");
  });

  it("the routes are guarded, and the run keeps what makes it comparable", () => {
    const runs = read("app/api/admin/voice-assist-test/runs/route.ts");
    expect(runs).toContain("isSuperuser(session)");
    expect(runs).toContain("blockReadOnlyImpersonation(session)");
    expect(runs, "the text leg has no recogniser, so it records no fingerprint")
      .toContain('body.leg === "text" ? null');
    const batch = read("app/api/admin/voice-assist-test/transcribe-clip/route.ts");
    expect(batch).toContain("isSuperuser(session)");
    expect(batch, "command bias on, diarisation off — one person, one sentence")
      .toContain("batchParams({ commandBias: true })");
  });
});
