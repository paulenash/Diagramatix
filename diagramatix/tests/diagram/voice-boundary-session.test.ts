/**
 * Paul, 2026-09-27: "No matter what I try the boundary move command is very
 * flaky" (Voice-Assist-test-diagram-voice-debug-2026-09-27.dgx-voice (4).json,
 * fixture boundary-session-4.json). Five causes, all fixed here.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseCommand } from "@/app/lib/assist/commandGrammar";
import { applyAssistOps } from "@/app/lib/assist/applyAssistOps";
import { headlessDiagram } from "@/app/lib/assist/headlessDiagram";
import { isIncompleteCommand } from "@/app/lib/assist/incompleteCommand";
import { stitchFinals } from "@/app/lib/assist/fragmentBuffer";
import { isFlowEndWord } from "@/app/lib/assist/stopWords";
import { parsePoolBoundaryPhrase } from "@/app/lib/assist/poolBoundaryPhrase";
import { buildPickFlow } from "@/app/lib/assist/disambiguate";
import { interruptsPick } from "@/app/lib/assist/pickInterrupt";
import type { DiagramData } from "@/app/lib/diagram/types";
import { editorSource } from "./assistApplySource";

const session = JSON.parse(readFileSync("tests/fixtures/voice-debug/boundary-session-4.json", "utf8")) as {
  diagram: DiagramData; heard: Array<{ text: string; atMs: number }>;
};
const run = (said: string, selectedIds: string[] = []) => {
  const h = headlessDiagram(structuredClone(session.diagram));
  const ops = parseCommand(said);
  return { h, ops, r: ops ? applyAssistOps(ops, h.context({ selectedIds })) : null };
};

describe("T4965 — the boundary session: halves held, the question gives way, numbers read, the selection used", () => {
  it("a move with no way yet is held for the rest — every half Paul paused after", () => {
    for (const half of ["move underwriters team", "move underwriters team lane", "move selected lanes", "move selected lines top boundary", "move selected lines top", "move claim team", "move selected line"]) {
      expect(isIncompleteCommand(half), half).toBe(true);
    }
    for (const whole of ["move top to bottom", "move Pool 3 above Customer", "move Pay Claim up", "move everything in Underwriters two steps to the right"]) {
      expect(isIncompleteCommand(whole), whole).toBe(false);
    }
  });

  it("replayed with his own pauses, the halves join into the commands he said — and none asks “which pool?”", () => {
    const finals = session.heard.filter((l) => !isFlowEndWord(l.text) && !/^(?:undo|two|pass tasks)$/i.test(l.text));
    const commands = stitchFinals(finals);
    expect(commands).toEqual(expect.arrayContaining([
      "move selected lines top boundary up one hundred",
      "move underwriters team top boundary up one hundred",
      "move claim team bottom boundary down one hundred",
      "move underwriters check-in line top boundary down to tasks",
      "move underwriters team top boundary down",
    ]));
    for (const c of commands) {
      const { r } = run(c, ["L2"]);
      if (r) expect(r.summary, c).not.toMatch(/which “the pool”/);
    }
  });

  it("the distance is read as said: “one hundred” is 100 (it moved 1px), “one fifty”, “two hundred and fifty”, “to tasks”", () => {
    const d = (s: string) => { const p = parsePoolBoundaryPhrase(s); return p && p !== "needs-direction" ? p.distance : undefined; };
    expect(d("move Underwriters team top boundary up one hundred")).toBe(100);
    expect(d("move Underwriters team top boundary up a hundred and twenty")).toBe(120);
    expect(d("move Underwriters team top boundary up one fifty")).toBe(150);
    expect(d("move Underwriters team top boundary up two hundred and fifty")).toBe(250);
    expect(d("move Underwriters team top boundary down to tasks")).toBe(128);
  });

  it("with a lane selected, a boundary with no name is that lane's — not “which pool?”; “selected Claims” is the selected one called that", () => {
    const { r, h } = run("top boundary up by 60", ["L2"]);
    expect(r!.summary).toBe("moved Underwriters team's top boundary up 60px");
    expect(h.data.elements.find((e) => e.id === "L2")!.y).toBeCloseTo(session.diagram.elements.find((e) => e.id === "L2")!.y - 60, 6);
    expect(run("move selected Claims bottom boundary down fifty", ["L1", "L2", "L3"]).r!.summary).toBe("moved Claims team's bottom boundary down 50px");
  });

  it("while “which one?” is up, a whole new command closes it and runs; an answer still answers", () => {
    const els = session.diagram.elements;
    const pools = els.filter((e) => e.type === "pool").map((e) => e.id);
    const flow = buildPickFlow([{ op: "movePoolBoundary", ref: "the pool", boundary: "top", direction: "up" }], "the pool", pools, els)!;
    expect(interruptsPick("move underwriters team top boundary up by 60", flow)).toBe(true);
    expect(interruptsPick("two", flow)).toBe(false);
    expect(interruptsPick("up one hundred", flow), "a half is not a command").toBe(false);
    const ed = editorSource();
    expect(ed).toContain("if (pickFlowRef.current && interruptsPick(heard, pickFlowRef.current)) setPickFlow(null);");
  });
});
