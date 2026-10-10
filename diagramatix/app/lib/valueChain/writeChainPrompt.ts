import { prisma } from "@/app/lib/db";
import type { MdPromptType } from "./promptTemplates";
import type { PromptStamp } from "./promptStamp";

/**
 * THE one place a GENERATED prompt is saved to a chain.
 *
 * Before 2026-10-10 the regenerate handler wrote the row inline. "Create a New Value Chain" writes prompts too, and two writers is how
 * one of them forgets to stamp the template version (one rule, one place). Every generation path goes through here, so every generated
 * prompt carries the version of the master template that wrote it, the house rules in force, a hash of the exact briefing, and the
 * model.
 *
 * Imports, adoptions and hand edits are not generation and do not go through here: they carry no stamp, and a hand edit leaves the
 * stamp of the text it was edited from (it is still "written to v9" until it is regenerated).
 */
export interface WriteChainPromptArgs {
  chainId: string;
  type: MdPromptType;
  /** The process code for a BPMN prompt; "" for a chain-level one. */
  processCode: string;
  name: string;
  prompt: string;
  roundTrips: boolean;
  /** The AI model id that wrote it. */
  model: string;
  stamp: PromptStamp;
}

export async function writeChainPrompt(a: WriteChainPromptArgs): Promise<void> {
  const processCode = a.type === "bpmn" ? a.processCode : "";
  const fields = {
    name: a.name, prompt: a.prompt, roundTripsOk: a.roundTrips, generatedAt: new Date(), model: a.model,
    templateVersion: a.stamp.templateVersion, additionsHash: a.stamp.additionsHash, templateHash: a.stamp.templateHash,
  };
  await prisma.valueChainPrompt.upsert({
    where: { chainId_type_processCode: { chainId: a.chainId, type: a.type, processCode } },
    create: { chainId: a.chainId, type: a.type, processCode, ...fields },
    update: fields,
  });
}
