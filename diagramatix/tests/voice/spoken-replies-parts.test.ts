/**
 * T5232 — the pure parts of spoken replies: what is worth saying, the microphone gate, the echo verdict, and the
 * wiring that connects them (Paul, 2026-10-04).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { spokenText, speechPurposeFor } from "@/app/lib/voice/spokenText";
import { isMicGated, noteSpeaking, resetMicGate, MIC_GATE_TAIL_MS } from "@/app/lib/voice/micGate";
import { echoVerdict } from "@/app/lib/voice/echoGate";

describe("T5232 what is worth saying", () => {
  it("a command that did not happen is a problem whatever its wording (the log's verdict counts)", () => {
    expect(spokenText("didn’t understand that", "problems", { ok: false })).toBe("didn't understand that".replace("'", "'"));
    expect(spokenText("didn’t understand that", "problems", { ok: true })).toBe("");
    expect(spokenText("didn’t understand that", "problems")).toBe("");                         // no verdict: as before
    expect(spokenText("no room above Underwriters", "problems")).not.toBe("");                // refusal wording still counts
  });
  it("questions are always spoken at Questions / Problems; successes only at Everything; Off is silent", () => {
    expect(spokenText("clear the whole diagram (12 elements)? — say “yes” to confirm", "questions", { ok: true })).toMatch(/clear the whole diagram/);
    expect(spokenText("added a task after Review", "problems", { ok: true })).toBe("");
    expect(spokenText("added a task after Review", "everything", { ok: true })).toMatch(/added a task/);
    expect(spokenText("anything? yes", "off", { ok: false })).toBe("");
  });
  it("the reason recorded on the usage row: question, then failure, else success", () => {
    expect(speechPurposeFor("which one?", true)).toBe("question");
    expect(speechPurposeFor("no room above it", true)).toBe("refusal");
    expect(speechPurposeFor("didn't understand that", false)).toBe("refusal");
    expect(speechPurposeFor("added a task", true)).toBe("success");
  });
});

describe("T5232 the microphone gate", () => {
  beforeEach(() => resetMicGate());
  it("shut while the voice sounds, and for a short tail after it stops; open otherwise", () => {
    expect(isMicGated(1000)).toBe(false);
    noteSpeaking(true, 2000);
    expect(isMicGated(2500)).toBe(true);
    noteSpeaking(false, 3000);
    expect(isMicGated(3000 + MIC_GATE_TAIL_MS - 1)).toBe(true);        // the recogniser finalises the tail late
    expect(isMicGated(3000 + MIC_GATE_TAIL_MS + 1)).toBe(false);
  });
  it("a stop noted when nothing was speaking does not shut the gate", () => {
    noteSpeaking(false, 5000);
    expect(isMicGated(5001)).toBe(false);
  });
});

describe("T5232 the echo verdict", () => {
  it("not gated: pass. Gated: stop / cancel words barge in, everything else is ignored", () => {
    expect(echoVerdict("add a task called Echo", false)).toBe("pass");
    expect(echoVerdict("stop", true)).toBe("bargeIn");
    expect(echoVerdict("cancel", true)).toBe("bargeIn");
    expect(echoVerdict("done", true)).toBe("bargeIn");
    expect(echoVerdict("add a task called Echo", true)).toBe("ignore");
    expect(echoVerdict("say yes to confirm", true)).toBe("ignore");
  });
});

describe("T5232 the wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("the microphone is opened with echo cancellation asked for", () => {
    expect(read("app/lib/dictation/index.ts")).toContain("audio: { echoCancellation: true }");
  });
  it("the session offers every log line to the host, and gates onText and onInterim", () => {
    const s = read("app/hooks/useVoiceSession.ts");
    expect(s).toContain("speakReplyRef.current?.(entry.summary, entry.ok)");
    expect(s).toContain("echoVerdict(t, host.isMicGated?.() === true)");
    expect(s).toContain("host.stopSpeech?.()");
  });
  it("the editor passes the speech callbacks, and the bar shows the controls only when speech is granted", () => {
    const e = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    expect(e).toContain("speakReply, isMicGated: isMicGated, stopSpeech");
    expect(e).toContain("speech={speechAvail?.available ? {");
    expect(read("app/components/canvas/VoiceAssistBar.tsx")).toContain("{speech && (");
  });
  it("the speaker tells the gate when it starts and stops, however it stops", () => {
    expect(read("app/hooks/useVoiceAssist.ts")).toContain("noteSpeaking(on)");
    expect(read("app/hooks/useVoiceAssist.ts")).toContain("noteSpeaking(false)");
  });
});

describe("T5233 the same spoken replies on the phone", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("the phone editor hands the session the speech callbacks, in the phone's own words", () => {
    const m = read("app/components/mobile/MobileVoiceEditor.tsx");
    expect(m).toContain("speakReply, isMicGated, stopSpeech,");
    expect(m).toContain("const wording = phoneWording(summary);");
    expect(m).toContain("spokenText(wording, voiceSpeech.verbosity, { ok })");
    expect(m).toContain("useSpeechAvailable()");
  });
  it("the controls appear only when speech is granted; a tap unlocks the audio (switch and mic button)", () => {
    const m = read("app/components/mobile/MobileVoiceEditor.tsx");
    expect(m).toContain("{speechAvail?.available && (");
    expect(m).toContain("if (voiceSpeech.speakEnabled) speaker.unlock();");
    expect(read("app/hooks/useVoiceAssist.ts")).toContain("if (on) speaker.unlock();");
  });
});
