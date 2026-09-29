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

/**
 * The editor's source as every guard reads it (see above): the editor, then the
 * code moved out of it that it still owns in spirit — autosave and the
 * template-window types (appended, so nothing earlier moves).
 */
export const editorSource = (): string =>
  [read(EDITOR_PATH), readIfThere(AUTO_SAVE_PATH), readIfThere(TEMPLATE_TYPES_PATH)].filter(Boolean).join("\n");

/** The same with comments removed — for guards that pin the wiring, not the prose about it. */
export const editorCode = (): string =>
  editorSource().replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

/** The apply layer alone. */
export const applyLayerSrc = (): string => read(APPLY_LAYER_PATH);

/** The editor, then the apply layer it delegates to. */
export const editorWithApplyLayer = (): string => editorSource() + "\n" + applyLayerSrc();
