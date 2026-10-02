/**
 * Stage 4 of mobile voice (2026-09-29): the desktop Voice Assist session moved
 * UNEDITED out of DiagramEditor.tsx into app/hooks/useVoiceSession.ts so the
 * phone can share it. The behaviour tests in tests/voice-session/ prove it still
 * does what it did; these guard the MOVE itself — where the hook is called, the
 * order of its effects, and what may import what.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { VOICE_SESSION_MARKER } from "./assistApplySource";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8").replace(/\r\n/g, "\n");
const EDITOR = () => read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
const HOOK = () => read("app", "hooks", "useVoiceSession.ts");
const AUTOSAVE = () => read("app", "hooks", "useAutoSave.ts");

/** The dependency arrays of every useEffect in the source, in order. */
function effectDeps(src: string): string[] {
  const sf = ts.createSourceFile("x.tsx", src, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  (function visit(n: ts.Node) {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "useEffect") {
      out.push(n.arguments[1] ? n.arguments[1].getText(sf).replace(/\s+/g, " ") : "(none)");
    }
    ts.forEachChild(n, visit);
  })(sf);
  return out;
}

/** The session's 11 effects, in the order they ran inside the editor (gold flash → touched → settle → drain …). */
const SESSION_EFFECT_DEPS = [
  "[debugAllowed]",   // the debug-recording preference — now gated on the host's debugAllowed (SuperAdmin only, 2026-10-02)
  "[voiceAssistOn]",
  "[diagramId]",
  "[voiceAssistOn, voiceDebugRecording, debugEpoch]",
  "[data.elements]",
  "[data.elements]",
  "[data, voiceLog]",
  "[voiceDrainTick]",
  "[renameFlow, messageFlow, pickFlow, templateFlow, dividerFlow, cancelRenameFlow, setMessageFlow, setPickFlow, setDividerFlow, appendLog]",
  "[voiceAssistOn, stopAbraListening]",
  "[]",
];

describe("T5080 — the voice session moved out of the editor, and sits where the block was", () => {
  it("the editor calls the hook once, at the block's old place: after the ghost-assist ref, before the context check, with the template-window ref declared first", () => {
    const ed = EDITOR();
    expect(ed.split(VOICE_SESSION_MARKER)).toHaveLength(2);
    expect(ed.match(/\buseVoiceSession\(/g) ?? []).toHaveLength(1);
    const call = ed.indexOf("useVoiceSession(");
    expect(ed.lastIndexOf("nextStepRef.current = {", call), "after the ghost-assist ref").toBeGreaterThan(-1);
    expect(ed.indexOf("const isContext", call), "before the context check").toBeGreaterThan(call);
    expect(ed.indexOf("const openTemplateWindowRef = useRef")).toBeGreaterThan(-1);
    expect(ed.indexOf("const openTemplateWindowRef = useRef")).toBeLessThan(call);
    // …and nothing of the session is left behind in it
    expect(ed).not.toContain("const voiceQueueRef");
    expect(ed).not.toContain("useState<CommandLogEntry[]>");
    expect(ed).not.toMatch(/\bstartDictation\(/);
    expect(ed).not.toContain("const runVoiceCommand = useCallback");
  });

  it("the hook's effects are the session's eleven, in the same order", () => {
    expect(effectDeps(HOOK())).toEqual(SESSION_EFFECT_DEPS);
  });

  it("the hook can be shared: it imports nothing from a page, and only types from components", () => {
    const hook = HOOK();
    const imports = [...hook.matchAll(/^import (type )?[^;]*? from "([^"]+)";$/gm)].map((m) => ({ typeOnly: !!m[1], spec: m[2], text: m[0] }));
    expect(imports.filter((i) => i.spec.includes("(dashboard)") || i.spec.includes("/app/(")), "no page imports").toEqual([]);
    const components = imports.filter((i) => i.spec.startsWith("@/app/components/"));
    expect(components.filter((i) => !i.typeOnly).map((i) => i.text), "components: types only").toEqual([]);
    expect(hook).toContain("export function useVoiceSession(host: VoiceSessionHost)");
  });

  it("the Voice Assist Test page and the Replay tab do not import the editor or the moved hooks — their scores cannot move with it", () => {
    const dir = join(process.cwd(), "app", "(dashboard)", "dashboard", "admin", "voice-assist-test");
    const files = readdirSync(dir).filter((f) => /\.(tsx?|mts)$/.test(f) && statSync(join(dir, f)).isFile());
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const src = readFileSync(join(dir, f), "utf8");
      expect(src, f).not.toMatch(/DiagramEditor|useVoiceSession|useAutoSave/);
    }
  });

  it("autosave is defined once, called by the editor as before, and never collapses review comments", () => {
    const ed = EDITOR();
    expect(ed).not.toMatch(/function useAutoSave\(/);
    expect(ed).toContain('import { useAutoSave } from "@/app/hooks/useAutoSave";');
    expect(ed.match(/\buseAutoSave\(/g) ?? []).toHaveLength(1);
    const auto = AUTOSAVE();
    expect(auto.match(/export function useAutoSave\(/g) ?? []).toHaveLength(1);
    expect(auto).not.toMatch(/collapseAllReviewComments|reviewCollapse/);
  });
});
