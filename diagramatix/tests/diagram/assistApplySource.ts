/**
 * The source text a Voice Assist wiring guard reads.
 *
 * `applyAssistOps` lived inside DiagramEditor.tsx until 2026-09-25, when it
 * moved to app/lib/assist/applyAssistOps.ts so the test harness could run it
 * headless (L4). Dozens of guards pin lines of that body by reading the
 * editor's source. They read BOTH files through here, so a guard follows the
 * code to wherever it lives and cannot go blind the next time it moves.
 */
import { readFileSync } from "fs";
import { join } from "path";

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

export const APPLY_LAYER_PATH = join("app", "lib", "assist", "applyAssistOps.ts");

/** The apply layer alone. */
export const applyLayerSrc = (): string => read(APPLY_LAYER_PATH);

/** The editor, then the apply layer it delegates to. */
export const editorWithApplyLayer = (): string =>
  read("app", "(dashboard)", "diagram", "[id]", "DiagramEditor.tsx") + "\n" + applyLayerSrc();
