import { createHash } from "node:crypto";
import { latestTemplateVersion, type MdPromptType } from "./promptTemplates";

/**
 * What a generated prompt REMEMBERS about how it was made (Paul, 2026-10-10, "Create a New Value Chain": "These diagram prompts need to
 * remember their master prompt versions used for their creation").
 *
 * Until now the version was inferred: `templateVersionAt(type, generatedAt)` looked the timestamp up in the shipped-at history. That is
 * only as good as the history and the clock, and it cannot see the house-rule additions at all. These three values are written at the
 * moment the prompt is written and never recomputed:
 *
 *   templateVersion — the built-in template version in force for the type;
 *   additionsHash   — the house-rule additions merged into the briefing (master's + the Org's own);
 *   templateHash    — the FULL briefing text that was sent, so "what exactly produced this?" has a checkable answer.
 *
 * Server-side only (node:crypto). The comparison the browser needs lives in promptTemplates.ts.
 */
export interface PromptStamp {
  templateVersion: number;
  additionsHash: string;
  templateHash: string;
}

/** A short, stable fingerprint of some text. 12 hex characters of SHA-256: plenty to tell two briefings apart, short enough to show. */
export function hashText(text: string): string {
  return createHash("sha256").update(text ?? "", "utf8").digest("hex").slice(0, 12);
}

/**
 * The stamp for a prompt about to be written.
 * @param briefing  the complete briefing sent to the model (built-in template + additions)
 * @param additions the additions merged into it (master's and the Org's, joined as they were); "" when there are none
 */
export function stampFor(type: MdPromptType, briefing: string, additions: string): PromptStamp {
  return {
    templateVersion: latestTemplateVersion(type).version,
    additionsHash: hashText((additions ?? "").trim()),
    templateHash: hashText(briefing),
  };
}
