/**
 * Paul's two convert sessions, 2026-09-27 (…voice-debug-2026-09-27.dgx-voice (1).json
 * and (2).json). "Check Coverage" is on his diagram, its name is sent to the
 * recogniser, and "convert" kept coming back as "Coverage". Once the AI turned
 * the garble into a rename nobody asked for — and the next convert found the
 * new name.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { repairHeardWords, repairConvertWord } from "@/app/lib/assist/selectedWord";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { fixtureDiagram } from "@/app/lib/assist/commandFixture";
import { aiInventedRename, INVENTED_RENAME_REFUSAL } from "@/app/lib/assist/aiGuards";
import { diagramKeyterms, VERB_SHADOWS } from "@/app/lib/dictation/diagramKeyterms";
import type { AssistOp } from "@/app/lib/assist/ops";

describe("T4947 — “Coverage …” is “convert …” in the convert shape; “Processing” is a subprocess", () => {
  it("Paul's heard lines now parse as the convert he said", () => {
    const heard: Array<[string, string, "task" | "subprocess"]> = [
      ["Coverage check claim to a task", "check claim", "task"],
      ["Coverage selected to a subprocess", "selected", "subprocess"],
      ["Pass Check claim to a subprocess", "Check claim", "subprocess"],
      ["Coverage process check claim to a task", "process check claim", "task"],
      ["convert selected to a Processing", "selected", "subprocess"],
      ["convert review claim to a sub process", "review claim", "subprocess"],
    ];
    for (const [said, ref, to] of heard) {
      expect(parseCommand(said), said).toEqual([{ op: "convertActivity", ref, to }]);
    }
  });

  it("only the first word, only in that shape — a sentence heard right cannot change", () => {
    expect(repairConvertWord("Coverage Check? claim").corrected, "no convert tail").toBe(false);
    expect(repairConvertWord("Coverage").corrected).toBe(false);
    expect(repairConvertWord("rename Coverage to a task").corrected, "a verb is there").toBe(false);
    expect(repairConvertWord("add a task called Pass to a task").corrected).toBe(false);
    expect(repairHeardWords("Coverage check claim to a task")).toBe("Convert check claim to a task");   // its capital kept, as "Mood" → "Move"
  });

  it("on the test diagram, “Coverage check claim to a task” converts Check Claim back — not Check Coverage", () => {
    const h = headlessDiagram(fixtureDiagram());
    const say = (t: string, sel: string[] = []) => applyAssistOps(parseCommand(t)!, h.context({ selectedIds: sel }));
    expect(say("Pass Check claim to a subprocess").ok).toBe(true);
    expect(h.data.elements.find((e) => e.id === "95k4p9hz")!.type).toBe("subprocess");
    expect(say("Coverage check claim to a task")).toEqual({ ok: true, summary: "converted Check Claim to a task" });
    expect(h.data.elements.find((e) => e.id === "95k4p9hz")!.type).toBe("task");
    expect(h.data.elements.find((e) => e.id === "kkc0tsyc")!.type, "Check Coverage untouched").toBe("task");
    expect(say("Coverage selected to a subprocess", ["t4"]).summary).toBe("converted Task 1 to a subprocess");
  });
});

describe("T4948 — the AI never invents a rename", () => {
  const rename: AssistOp[] = [{ op: "rename", ref: "Check Coverage", label: "Coverage Check?" }];

  it("a rename the user did not ask for is refused; one they did ask for stands", () => {
    // Paul's line: the AI answered "rename Check Coverage to Coverage Check?".
    expect(aiInventedRename("Coverage Check? claim", rename)).toBe(true);
    for (const said of ["rename check coverage to coverage check", "call it Coverage Check", "change Check Coverage to Coverage Check", "relabel the task", "label selected Yes"]) {
      expect(aiInventedRename(said, rename), said).toBe(false);
    }
    // Anything that is not a rename is the AI's to repair, as before.
    expect(aiInventedRename("Pass Check claim to a subprocess", [{ op: "convertActivity", ref: "Check Claim", to: "subprocess" }])).toBe(false);
  });

  it("the editor checks it on BOTH AI paths — the canonical sentence and the raw ops — and the prompt says it too", () => {
    const ed = readFileSync("app/(dashboard)/diagram/[id]/DiagramEditor.tsx", "utf8");
    expect(ed).toContain("if (canonicalOps && aiInventedRename(heard, canonicalOps)) { log({ heard, summary: INVENTED_RENAME_REFUSAL");
    expect(ed).toContain("if (aiInventedRename(heard, aiOps)) { log({ heard, summary: INVENTED_RENAME_REFUSAL");
    expect(INVENTED_RENAME_REFUSAL).toMatch(/^didn’t understand that — nothing was renamed/);
    expect(readFileSync("app/api/ai/command/route.ts", "utf8")).toContain("NEVER answer with a rename unless the user said rename / call / name / label / change");
  });
});

describe("T4949 — a label that shadows a command verb is not sent to the recogniser", () => {
  it("“Check Coverage” pulled “convert”, so it stays home; its neighbours still go", () => {
    expect(VERB_SHADOWS.get("coverage")).toBe("convert");
    const sent = diagramKeyterms(["Check Coverage", "Check Claim", "Pay Claim", "Coverage Check"]);
    expect(sent).not.toContain("Check Coverage");
    expect(sent).not.toContain("Coverage Check");
    expect(sent).toEqual(expect.arrayContaining(["Check Claim", "Pay Claim"]));
  });
});
