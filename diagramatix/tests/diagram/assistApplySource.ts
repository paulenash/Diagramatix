/**
 * The source text a Voice Assist wiring guard reads.
 *
 * `applyAssistOps` lived inside DiagramEditor.tsx until 2026-09-25, when it
 * moved to app/lib/assist/applyAssistOps.ts so the test harness could run it
 * headless (L4). Dozens of guards pin lines of that body by reading the
 * editor's source. They read BOTH files through here, so a guard follows the
 * code to wherever it lives and cannot go blind the next time it moves.
 *
 * Stage 4 of mobile voice (2026-09-29) moves the voice session out of the
 * editor into app/hooks/useVoiceSession.ts. EVERY test that reads the editor's
 * source reads it through `editorSource()`: once the hook exists, its text is
 * spliced back in at its call site, so each pinned slice, order and count
 * reads the code in the order it always had. Until then it is the editor
 * itself, unchanged.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

export const EDITOR_PATH = join("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx");
export const APPLY_LAYER_PATH = join("app", "lib", "assist", "applyAssistOps.ts");

export const AUTO_SAVE_PATH = join("app", "hooks", "useAutoSave.ts");
export const TEMPLATE_TYPES_PATH = join("app", "hooks", "voiceTemplateTypes.ts");

const readIfThere = (p: string): string => { try { return read(p); } catch { return ""; } };

export const VOICE_SESSION_PATH = join("app", "hooks", "useVoiceSession.ts");
/** The line in DiagramEditor.tsx where the voice session hook is called — the block's old place. */
export const VOICE_SESSION_MARKER = "  // ── Voice Assist: session hook (app/hooks/useVoiceSession.ts) ──";

/**
 * The editor's source as every guard reads it (see above): the editor with the
 * voice session hook spliced back in at its call site — so every slice, order
 * and count reads the code in the order it always had — then the code moved
 * out of it that it still owns in spirit: autosave and the template-window
 * types (appended, so nothing earlier moves).
 */
export const editorSource = (): string => {
  const editor = read(EDITOR_PATH);
  let text = editor;
  if (editor.includes(VOICE_SESSION_MARKER)) {
    if (editor.split(VOICE_SESSION_MARKER).length !== 2) throw new Error("the voice session marker must appear exactly once in DiagramEditor.tsx");
    const hook = readIfThere(VOICE_SESSION_PATH);
    if (!hook) throw new Error("DiagramEditor.tsx calls the voice session hook, but app/hooks/useVoiceSession.ts is missing");
    const at = editor.indexOf(VOICE_SESSION_MARKER);
    text = editor.slice(0, at) + hook + "\n" + editor.slice(at);
  }
  return [text, readIfThere(AUTO_SAVE_PATH), readIfThere(TEMPLATE_TYPES_PATH)].filter(Boolean).join("\n");
};

/** The same with comments removed — for guards that pin the wiring, not the prose about it. */
export const editorCode = (): string =>
  editorSource().replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** The apply layer alone. */
export const applyLayerSrc = (): string => read(APPLY_LAYER_PATH);

/** The editor, then the apply layer it delegates to. */
export const editorWithApplyLayer = (): string => editorSource() + "\n" + applyLayerSrc();
