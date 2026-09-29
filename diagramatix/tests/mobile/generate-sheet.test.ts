/**
 * The phone's Generate sheet (2026-09-28, mobile voice stage 1): dictate, type
 * or pick a saved prompt; optionally Tidy it and answer its questions; Generate.
 *
 * Covered here without a phone: how the sheet's words become the prompt the
 * server job runs, the one-speaker note, the PROSE dictation mode (and that
 * Voice Assist's command mode is untouched), and the screen's wiring — who is
 * offered Generate, and that a run is polled and resumed rather than awaited.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  EMPTY_DRAFT, addSpokenTo, draftFromFailedJob, draftToRequest, joinSpoken, withAnswers, type GenerateDraft,
} from "@/app/lib/mobile/generateDraft";
import {
  MEETING_TRANSCRIPT_PREAMBLE, SPOKEN_DESCRIPTION_PREAMBLE, hasSpokenPreamble, stripSpokenPreamble, withSpokenPreamble,
} from "@/app/lib/ai/promptPreambles";
import { liveStreamParams } from "@/app/lib/dictation/asrParams";
import { asrFingerprint } from "@/app/lib/dictation/asrParams";

const read = (p: string) => readFileSync(p, "utf8");
const draft = (d: Partial<GenerateDraft>): GenerateDraft => ({ ...EMPTY_DRAFT, ...d });

describe("T5015 — the sheet's words become the prompt the job runs", () => {
  it("spoken phrases join with one space; nothing spoken changes nothing", () => {
    expect(joinSpoken("", "The customer orders.")).toBe("The customer orders.");
    expect(joinSpoken("The customer orders.", "The shop bakes.")).toBe("The customer orders. The shop bakes.");
    expect(joinSpoken("Line one\n", "Line two")).toBe("Line one\nLine two");
    expect(joinSpoken("Kept", "   ")).toBe("Kept");
  });

  it("spoken words get the one-speaker note (once); typed words do not", () => {
    const spoken = draftToRequest(draft({ prompt: " The customer orders a pizza. ", dictated: true }));
    expect(spoken).toEqual({ prompt: SPOKEN_DESCRIPTION_PREAMBLE + "The customer orders a pizza.", promptSource: "dictated" });
    expect(withSpokenPreamble(spoken.prompt), "never twice").toBe(spoken.prompt);
    expect(draftToRequest(draft({ prompt: "Typed.", dictated: false }))).toEqual({ prompt: "Typed.", promptSource: "typed" });
    expect(draftToRequest(draft({ prompt: "   " })).prompt, "nothing to send").toBe("");
  });

  it("answered Tidy questions go on the end as CLARIFICATIONS; unanswered ones are dropped", () => {
    const r = draftToRequest(draft({
      prompt: "Orders are checked.",
      questions: [{ q: "Who checks them?", a: " The duty manager. " }, { q: "Any deadline?", a: "" }],
    }));
    expect(r.prompt).toBe("Orders are checked.\n\nCLARIFICATIONS (answers to open questions — incorporate these):\n- Q: Who checks them?\n  A: The duty manager.");
  });

  it("an unchanged saved prompt goes as it is — no note — with its id; an edited one keeps the id for the server to judge", () => {
    const sel = { id: "p1", name: "Pizza v1", text: "A customer orders a pizza." };
    expect(draftToRequest(draft({ prompt: "A customer orders a pizza.", selected: sel }))).toEqual({
      prompt: "A customer orders a pizza.", promptSource: "typed", selectedPromptId: "p1",
    });
    const edited = draftToRequest(draft({ prompt: "A customer orders a pizza. Then it is delivered.", selected: sel, dictated: true }));
    expect(edited.selectedPromptId).toBe("p1");
    expect(hasSpokenPreamble(edited.prompt)).toBe(true);
    // Spoken, then the added words deleted again: back to the saved text — linked as it is, no note.
    const back = draftToRequest(draft({ prompt: "A customer orders a pizza.", selected: sel, dictated: true }));
    expect(back).toEqual({ prompt: "A customer orders a pizza.", promptSource: "dictated", selectedPromptId: "p1" });
  });

  it("spoken words land where they were said; answers ride along to a second Tidy", () => {
    const d = draft({ prompt: "Orders arrive.", questions: [{ q: "Who?", a: "" }, { q: "When?", a: "Daily" }] });
    expect(addSpokenTo(d, "prompt", "They are checked.")).toMatchObject({ prompt: "Orders arrive. They are checked.", dictated: true });
    const a = addSpokenTo(d, 0, "The clerk.");
    expect(a.questions[0].a).toBe("The clerk.");
    expect(a.dictated, "an answer is not the description").toBe(false);
    expect(withAnswers(a)).toBe("Orders arrive.\n\nCLARIFICATIONS (answers to open questions — incorporate these):\n- Q: Who?\n  A: The clerk.\n- Q: When?\n  A: Daily");
    expect(withAnswers(draft({ prompt: " Plain. " }))).toBe("Plain.");
  });

  it("a failed run's prompt comes back without the note, remembered as spoken", () => {
    expect(draftFromFailedJob(SPOKEN_DESCRIPTION_PREAMBLE + "My words.")).toEqual({ ...EMPTY_DRAFT, prompt: "My words.", dictated: true });
    expect(draftFromFailedJob("Typed words.")).toEqual({ ...EMPTY_DRAFT, prompt: "Typed words.", dictated: false });
    expect(stripSpokenPreamble("No note here.")).toBe("No note here.");
  });

  it("the two notes say different things: one person is not one lane", () => {
    expect(MEETING_TRANSCRIPT_PREAMBLE).toContain("Treat each distinct speaker as a role / lane");
    expect(SPOKEN_DESCRIPTION_PREAMBLE).toContain("not from who is speaking");
    expect(SPOKEN_DESCRIPTION_PREAMBLE).toContain("never an individual person's name");
  });
});

describe("T5016 — prompt dictation is punctuated prose; Voice Assist commands are not", () => {
  it("prose turns on capitals and full stops; the default (commands) is exactly as before", () => {
    const prose = liveStreamParams({ sampleRate: 48000, prose: true });
    expect(prose.get("smart_format")).toBe("true");
    expect(prose.get("punctuate")).toBe("true");
    const cmd = liveStreamParams({ sampleRate: 48000 });
    expect(cmd.get("smart_format")).toBe("false");
    expect(cmd.get("punctuate")).toBe("false");
    expect(asrFingerprint(prose), "a replayed command clip can tell them apart").not.toBe(asrFingerprint(cmd));
  });

  it("the socket takes prose from the caller; Voice Assist never asks for it; every prompt console and the phone do", () => {
    expect(read("app/lib/dictation/index.ts")).toContain("liveStreamParams({ sampleRate: ctx.sampleRate, keyterms: cb.keyterms, prose: cb.prose })");
    const ed = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");
    // Voice Assist's one call, whole: from its opening to the `});` that closes it.
    const at = ed.indexOf("const handle = await startDictation({");
    expect(at, "Voice Assist's dictation call is where this test looks for it").toBeGreaterThan(0);
    expect(ed.indexOf("const handle = await startDictation({", at + 1), "exactly one such call in the editor").toBe(-1);
    const va = ed.slice(at, ed.indexOf("\n    });", at));
    expect(va).toContain("keyterms: diagramKeyterms(");
    expect(va, "Voice Assist's command socket").not.toContain("prose");
    for (const f of [
      "app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx",
      "app/(dashboard)/diagram/[id]/PlanPanel.tsx",
      "app/(dashboard)/diagram/[id]/AiPanel.tsx",
    ]) expect(read(f), f).toMatch(/startDictation\(\{\s*(\/\/[^\n]*\n\s*)?prose: true,/);
    expect(read("app/lib/mobile/micController.ts"), "the phone sheet's mic").toMatch(/await start\(\{\s*prose: true,/);
    expect(read("app/components/mobile/MobileGenerateSheet.tsx")).toContain("createMicController<SpokenTarget>(startDictation, {");
    expect(read("app/components/canvas/RichTextEditor.tsx"), "comment dictation matches spoken commands (“bullet list”) — stays unpunctuated").not.toContain("prose: true");
  });

  it("the meeting note has one home — both consoles use it", () => {
    for (const f of ["app/(dashboard)/diagram/[id]/ai-generate/AiGenerateScreen.tsx", "app/(dashboard)/diagram/[id]/PlanPanel.tsx"]) {
      const src = read(f);
      expect(src, f).toContain("MEETING_TRANSCRIPT_PREAMBLE + text");
      expect(src, f).not.toContain("Treat each distinct speaker as a role / lane");
    }
  });
});

describe("T5017 — the phone screen: who is offered Generate, and a run that outlives the page", () => {
  const screen = read("app/m/diagram/[id]/MobileDiagramScreen.tsx");
  const sheet = read("app/components/mobile/MobileGenerateSheet.tsx");

  it("only an editor or owner, on a BPMN diagram, with AI allowed — and only while it is empty", () => {
    expect(screen).toContain("const canGenerate = !!d && d.canEdit && d.type === \"bpmn\" && aiAllowed;");
    expect(screen).toContain("canEdit: !!j.canEdit,");
    expect(screen).toContain(") : canGenerate && empty && gen.phase !== \"running\" ? (");
    expect(screen).not.toContain("Generating from a prompt is coming in the next update");
  });

  it("the run is started, then polled — at once when the phone wakes — and picked up again after a reload", () => {
    expect(screen).toContain("body: JSON.stringify({ ...body, version: d.version }),");
    expect(screen).toContain("fetch(`/api/diagrams/${diagramId}/generate/${runningJobId}`, { cache: \"no-store\" })");
    expect(screen).toContain("document.addEventListener(\"visibilitychange\", onVisible);");
    expect(screen).toContain("fetch(`/api/diagrams/${diagramId}/generate`, { cache: \"no-store\" })");
    expect(screen, "success reloads the saved diagram").toMatch(/job\.status === "succeeded"\) \{\s+(?:const was = dRef\.current;\s+)?const fresh = await load\(\);/);
    expect(screen, "a failure puts the words back (and its saved prompt, 2026-09-29)").toContain("draftFromFailedJob(job.promptText, job.selectedPrompt)");
  });

  it("the sheet: one mic (micController), saved prompts, Tidy with questions frozen while it runs, 16px inputs", () => {
    expect(sheet).toContain("return () => { mountedRef.current = false; micRef.current?.dispose(); };");
    expect(sheet, "Generate gets the finished draft, last phrase included").toContain("onGenerate(stopKeepingWords());");
    expect(sheet.match(/readOnly=\{tidying\}/g)?.length, "description and answers frozen during Tidy").toBe(2);
    expect(sheet).toContain("Your description changed while it was being tidied");
    expect(sheet).toContain("fetch(\"/api/prompts?diagramType=bpmn\"");
    expect(sheet).toContain("fetch(\"/api/ai/audio/refine-transcript\"");
    expect(sheet).toContain("questions.map((q) => ({ q, a: \"\" }))");
    expect(sheet.match(/className="[^"]*text-base[^"]*"/g)?.length, "textareas at 16px so iPhone does not zoom").toBeGreaterThanOrEqual(2);
    expect(sheet, "no browser dialogs").not.toMatch(/\b(alert|confirm|prompt)\(/);
  });
});
