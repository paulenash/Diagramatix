import { prisma } from "@/app/lib/db";
import { generateMdPrompt } from "./generatePrompt";
import { mdPromptCategory, buildMdPromptBriefing, type MdPromptType } from "./promptTemplates";
import { auditPrompts } from "./spliceBlocks";
import { writeChainPrompt } from "./writeChainPrompt";
import { stampFor } from "./promptStamp";
import type { PromptTarget } from "./generatePrompt";
import type { SubprocessHeading } from "./chainSource";

/**
 * Write ONE prompt and store it — the step the regenerate handler and "Create a New Value Chain" both perform, kept in one place so the
 * guards cannot drift apart (one rule, one place; extracted 2026-10-10 when the second caller arrived).
 *
 * Order: ask the model → refuse anything that fails its own checks (truncated, does not round-trip, unreadable) → refuse a prompt that asks
 * for a loop-back (the layout prunes that shape, so the repetition would vanish from the diagram) → store through the single writer, which
 * stamps the template version, the house rules and the briefing hash. The callers decide what to tell the user and what a failure means for
 * the rest of the run (a spend cap halts it; one bad prompt does not).
 */
export type StoreResult =
  | { status: "done"; chars: number; roundTrips: boolean; dataObjects: number; standardLoops: number }
  | { status: "error"; message: string }
  | { status: "refused"; message: string };

export async function generateAndStorePrompt(a: {
  apiKey: string;
  model: string;
  /** The complete briefing sent (built-in + additions). */
  briefing: string;
  /** The additions merged into it (for the stamp). */
  additions: string;
  chainId: string;
  chainCode: string;
  chainTitle: string;
  narrative: string;
  subs: SubprocessHeading[];
  target: PromptTarget;
  /** The prompt's name as stored ("C01.03 Check Credit" for BPMN; "C01 Title — Value Chain" otherwise). */
  name: string;
  answers?: string;
  entityNames?: string;
}): Promise<StoreResult> {
  const res = await generateMdPrompt({
    apiKey: a.apiKey, model: a.model, briefing: a.briefing, chainCode: a.chainCode, chainTitle: a.chainTitle,
    narrative: a.narrative, subs: a.subs, target: a.target, answers: a.answers, entityNames: a.entityNames,
  });
  if (!res.ok) return { status: "error", message: res.error };
  const audit = auditPrompts(res.prompt);
  if (audit.loopBacks > 0) return { status: "refused", message: "asks for a loop-back — not stored" };
  await writeChainPrompt({
    chainId: a.chainId, type: a.target.type, processCode: a.target.code, name: a.name, prompt: res.prompt, roundTrips: res.roundTrips, model: a.model,
    stamp: stampFor(a.target.type, a.briefing, a.additions),
  });
  return { status: "done", chars: res.prompt.length, roundTrips: res.roundTrips, dataObjects: audit.dataObjects, standardLoops: audit.standardLoops };
}

/**
 * The briefing for one prompt type: the built-in master template plus the house-rule ADDITIONS — the SuperAdmin's (master) row, then, for an
 * Org's repository, the Org's own. Returned with the additions on their own because the stamp needs both (promptStamp.ts). One loader for the
 * maintenance screens and for "Create a New Value Chain", so the two can never be written to different rules.
 */
export async function loadPromptBriefing(type: MdPromptType, orgId: string | null): Promise<{ briefing: string; additions: string }> {
  const master = await prisma.diagramRules
    .findFirst({ where: { category: mdPromptCategory(type), isDefault: true }, select: { rules: true } })
    .catch(() => null);
  const org = orgId
    ? await prisma.diagramRules.findFirst({ where: { category: mdPromptCategory(type), orgId, userId: null }, select: { rules: true } }).catch(() => null)
    : null;
  const additions = [master?.rules, org?.rules].filter(Boolean).join("\n\n");
  return { briefing: buildMdPromptBriefing(type, additions || undefined), additions };
}
