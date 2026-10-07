/**
 * Is this prompt ready to Plan? — the prompt checkers, in one place, in plain English, for the AI Generate screen.
 *
 * Paul, 2026-10-07 (after the Diagramatix BPMN prompt skill): use the skill's approach inside Diagramatix, starting with its cheapest
 * stage — the self-check. The three deterministic checkers already gate every repository prompt (scripts/check-chain-prompts.ts) and sit
 * in the skill's bundled checker; this runs the same ones on whatever is typed into the console, BEFORE the Plan call, so a prompt that
 * asks for something BPMN cannot draw is fixed at the source instead of being found in the diagram afterwards. No AI call, no cost.
 *
 * Only a prompt in the house format (it opens with "BPMN:") is judged. Free text — "A customer places an order…" — has none of the
 * structure the checkers read, so it would be reported as "fine" for the wrong reason; saying nothing is more honest.
 */
import { checkPromptBranches } from "./checkPromptBranches";
import { checkPromptShapes } from "./checkPromptShapes";
import { looksTruncated } from "./checkPromptTruncated";

export type ReadinessCode =
  | "boundary-on-non-activity" | "message-within-pool" | "boundary-leaves-subprocess" | "branch-without-destination" | "looks-cut-off";

export interface ReadinessIssue {
  code: ReadinessCode;
  /** 1-based line in the prompt to jump to, when there is one. */
  line?: number;
  /** One sentence a business user can act on. */
  message: string;
}

/** True when the text is written in the house format the checkers understand. */
export const isHousePrompt = (prompt: string): boolean => /^\s*BPMN\s*:/i.test(prompt ?? "");

export function checkPromptReadiness(prompt: string): ReadinessIssue[] {
  if (!isHousePrompt(prompt)) return [];
  const out: ReadinessIssue[] = [];

  for (const s of checkPromptShapes(prompt)) {
    out.push({ code: s.kind, line: s.line, message: `Line ${s.line}: ${s.detail}` });
  }
  for (const b of checkPromptBranches(prompt)) {
    out.push({
      code: "branch-without-destination", line: b.line,
      message: `Line ${b.line}: the branch "${b.condition}" under the gateway "${b.gateway}" does not say where it goes. End it with an End event, `
        + `"continues to <type> "<name>"", or a merge gateway.`,
    });
  }
  const cut = looksTruncated(prompt);
  if (cut) out.push({ code: "looks-cut-off", message: `The prompt looks unfinished: ${cut}.` });

  return out.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity));
}
