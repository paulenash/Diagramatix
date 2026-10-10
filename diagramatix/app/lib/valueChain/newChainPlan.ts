import type { MdPromptType } from "./promptTemplates";

/**
 * What a "Create a New Value Chain" run writes — PURE (no database, no AI), so the wizard in the browser shows exactly the count the server
 * will charge and enforce.
 */

/** The optional prompts the author chose; the Context and Value Chain prompts and the BPMN prompts are always written. */
export interface NewChainOptions { processContext: boolean; archimate: boolean }

export const normaliseOptions = (raw: unknown): NewChainOptions => {
  const o = (raw ?? {}) as Record<string, unknown>;
  return { processContext: o.processContext === true, archimate: o.archimate === true };
};

/** The prompt types a run writes, in the order it writes them: Value Chain, Context, the optional two, then one BPMN prompt per process. */
export function chainPromptTypes(opts: NewChainOptions): MdPromptType[] {
  return ["value-chain", "context", ...(opts.processContext ? ["process-context" as const] : []), ...(opts.archimate ? ["archimate" as const] : []), "bpmn"];
}

/** How many prompts (and so AI attempts) a complete run writes. */
export const plannedPromptCount = (opts: NewChainOptions, processCount: number): number =>
  2 + (opts.processContext ? 1 : 0) + (opts.archimate ? 1 : 0) + processCount;
