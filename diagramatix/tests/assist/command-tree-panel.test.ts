/**
 * Voice Assist Bubble Help — slice 3: what the editor panel shows, and the wiring.
 * Plan: new features/voice-assist-bubble-help-plan-2026-10-01.md
 *
 * The suite is node-only (no component rendering), so what the panel DECIDES lives in pure
 * modules — computePanel and targetNow — and is tested here; the component only draws it.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { computePanel, defaultCommandTree, targetNow } from "@/app/lib/assist/commandTree";
import { resolveRef } from "@/app/lib/assist/resolveRef";
import type { DiagramElement } from "@/app/lib/diagram/types";

const tree = defaultCommandTree();
const view = (interim: string, over: { ghost?: boolean; flow?: Parameters<typeof computePanel>[1]["flow"] } = {}) =>
  computePanel(tree, { interim, ghost: over.ghost ?? false, flow: over.flow ?? null });

describe("T5176 — the panel: first words, then next words, as Paul described", () => {
  it("nothing said: the first words of every command", () => {
    const v = view("");
    expect(v.mode).toBe("first");
    for (const w of ["add", "align", "assign", "connect", "convert", "delete", "insert", "move", "make", "nudge", "put", "rename"]) expect(v.lines, w).toContain(w);
    expect(v.heard).toBe("");
    expect(v.complete).toBe(false);
  });

  it("“rename” said: the type words, then the variables — written in his notation", () => {
    const v = view("rename");
    expect(v.mode).toBe("next");
    expect(v.heard).toBe("rename");
    for (const w of ["pools", "lanes", "tasks", "activities", "subprocesses", "gateways", "events", "messages", "connectors", "<existing_element_name>", "<existing_label_name>", "<target>"]) {
      expect(v.lines, w).toContain(w);
    }
    // optional words come last, in [ ]
    expect(v.lines.indexOf("[all]")).toBeGreaterThan(v.lines.indexOf("<existing_label_name>"));
  });

  it("while a name is being said the panel says so, offers “to”, and shows the variable as still open", () => {
    const v = view("rename Review Claim");
    expect(v.openSlot).toBeTruthy();
    expect(v.lines).toContain("to");
    expect(v.lines.some((l) => l.endsWith(" …"))).toBe(true);
  });

  it("a finished command says so", () => {
    expect(view("undo").complete).toBe(true);
    expect(view("rename lanes").complete).toBe(true);
  });

  it("words that start no command: say so and show the first words again, so the speaker can start over", () => {
    const v = view("frobnicate");
    expect(v.mode).toBe("no-match");
    expect(v.note).toMatch(/No command starts like that/);
    expect(v.lines).toContain("rename");
  });

  it("the Assist-only words appear only while ghost suggestions are showing", () => {
    expect(view("").lines).not.toContain("accept");
    expect(view("", { ghost: true }).lines).toEqual(expect.arrayContaining(["accept", "take"]));
  });
});

describe("T5177 — guided flows show their own words", () => {
  it("rename-by-number: the number (and then a name), or done", () => {
    const pick = view("", { flow: { kind: "rename", phase: "pick" } });
    expect(pick.mode).toBe("flow");
    expect(pick.lines).toEqual(expect.arrayContaining(["<number>", "done", "cancel"]));
    expect(pick.note).toMatch(/Pick one by its number/);
    const name = view("", { flow: { kind: "rename", phase: "name" } });
    expect(name.lines).toEqual(expect.arrayContaining(["<new_label_name>", "clear", "done"]));
  });

  it("move dividers: the number, then up or down, then how far", () => {
    expect(view("", { flow: { kind: "dividers" } }).lines).toEqual(expect.arrayContaining(["<number>", "done"]));
    expect(view("2", { flow: { kind: "dividers" } }).lines).toEqual(expect.arrayContaining(["up", "down"]));
    expect(view("2 down", { flow: { kind: "dividers" } }).complete).toBe(true);
  });

  it("a flow the tree has no sub-grammar for gets a plain hint, never a wrong list", () => {
    const v = view("", { flow: { kind: "other", label: "numbered pick" } });
    expect(v.mode).toBe("other-flow");
    expect(v.note).toMatch(/numbered pick is open/);
    expect(v.lines).toEqual(["<number>", "cancel"]);
  });

  it("while a flow is open the ordinary commands are NOT offered", () => {
    expect(view("", { flow: { kind: "dividers" } }).lines).not.toContain("rename");
  });
});

const T = (id: string, x: number, label: string): DiagramElement =>
  ({ id, type: "task", x, y: 100, width: 100, height: 60, label, properties: {} }) as unknown as DiagramElement;
const A = T("a", 0, "Alpha");
const B = T("b", 300, "Beta");
const C = T("c", 600, "Gamma");
const els = [A, B, C];
const overB = { x: 350, y: 130 };

describe("T5178 — the “Target:” line says what “this” will act on, from the resolver itself", () => {
  it("Paul's sequence: last touched A, cursor on B, nothing selected → B, under the cursor", () => {
    const t = targetNow(els, [], "a", overB);
    expect(t).toMatchObject({ kind: "cursor", id: "b" });
    expect(t.label).toBe("“Beta” (task) — under the cursor");
  });

  it("one thing selected → it, selected (the selection still wins over the cursor)", () => {
    expect(targetNow(els, ["a"], "c", overB)).toMatchObject({ kind: "selected", id: "a", label: "“Alpha” (task) — selected" });
  });

  it("several selected → the panel says “these”", () => {
    const t = targetNow(els, ["a", "b"], null, overB);
    expect(t).toMatchObject({ kind: "many", count: 2 });
    expect(t.label).toBe("2 things selected — say “these”");
  });

  it("cursor over nothing → the last one added; with none added, the last element on the diagram; an empty diagram → none", () => {
    const added = targetNow(els, [], "a", { x: 900, y: 900 });
    expect(added).toMatchObject({ kind: "last", id: "a" });
    expect(added.label).toBe("“Alpha” (task) — the last one you added");
    const fallback = targetNow(els, [], null, null);
    expect(fallback).toMatchObject({ kind: "last", id: "c" });
    expect(fallback.label).toBe("“Gamma” (task) — the last element on the diagram");
    expect(targetNow([], [], null, null).kind).toBe("none");
    expect(targetNow([], [], null, null).label).toMatch(/point at an element/);
  });

  it("it always agrees with resolveRef — the line can never show a different element from the one the command uses", () => {
    for (const [sel, last, ptr] of [[[], "a", overB], [["c"], "a", overB], [[], "b", { x: 50, y: 130 }], [[], "a", null]] as const) {
      const r = resolveRef("this", els, last, sel as string[], { pointer: ptr });
      const t = targetNow(els, sel, last, ptr);
      expect(t.id, JSON.stringify([sel, last, ptr])).toBe(r && "id" in r ? r.id : undefined);
    }
  });

  it("an unnamed element is described by its type", () => {
    const noName = { ...A, label: "" } as DiagramElement;
    expect(targetNow([noName], ["a"], null, null).label).toBe("an unnamed task — selected");
  });
});

describe("T5179 — the panel is wired in: separate from the canvas Bubble Help, gated, and cannot eat clicks", () => {
  const read = (...p: string[]) => readFileSync(p.join("/"), "utf8").replace(/\r\n/g, "\n");
  const editor = read("app/(dashboard)/diagram/[id]/DiagramEditor.tsx");

  it("the editor draws it only inside Voice Assist's own gate (BPMN, not read-only, voice-assist available) and when the SuperAdmin switch is on", () => {
    expect(editor).toContain("const bubbleActive = voiceAssistOn && !readOnly && diagramType === \"bpmn\" && voiceAssistAllowed;");
    expect(editor).toContain("const bubbleShown = bubbleActive && !!bubbleHelp.tree && bubbleHelp.on;");
    expect(editor).toContain("{bubbleShown && bubbleView && (");
  });

  it("the panel's content comes from the pure modules, not decided in the component", () => {
    expect(editor).toContain("computePanel(bubbleHelp.tree,");
    const panel = read("app/components/canvas/VoiceBubbleHelpPanel.tsx");
    expect(panel).not.toMatch(/tokenise|tree\.next|resolveRef/);
  });

  it("it reads the editor route and its own localStorage key — nothing shared with the canvas Bubble Help", () => {
    const hook = read("app/hooks/useVoiceBubbleHelp.ts");
    expect(hook).toContain('"/api/voice-bubble-help"');
    expect(hook).toContain('"diagramatix.voiceBubbleHelp"');
    expect(hook).not.toMatch(/diagramatix\.bubbleHelp"|\/api\/bubble-helps/);
  });

  it("the bar shows a Next words button only when there is a tree to show", () => {
    expect(editor).toContain("bubbleHelp={bubbleHelp.tree ? {");
    expect(read("app/components/canvas/VoiceAssistBar.tsx")).toContain("Next words");
  });

  it("the target outline is a dashed, pointer-transparent rect inside the canvas world group", () => {
    const canvas = read("app/components/canvas/Canvas.tsx");
    expect(canvas).toContain("{voiceTargetOutline && (");
    expect(canvas).toMatch(/data-voice-target-outline/);
    const at = canvas.indexOf("{voiceTargetOutline && (");
    expect(canvas.slice(at, at + 700)).toContain('pointerEvents: "none"');
    expect(editor).toContain("voiceTargetOutline={bubbleOutline}");
  });

  it("the panel is draggable (it reuses FloatingPanel) and has no browser dialogs", () => {
    const panel = read("app/components/canvas/VoiceBubbleHelpPanel.tsx");
    expect(panel).toContain("FloatingPanel");
    expect(panel).not.toMatch(/window\.(confirm|alert|prompt)/);
  });
});
