/**
 * Writing one diagram prompt for a Process Repository `.md`.
 *
 * The AI-facing half of the prompt generator: it takes a master template (a
 * built-in from `promptTemplates.ts` plus the organisation's stored additions),
 * a chain's narrative, and one target, and returns the prompt text ready to drop
 * into the document.
 *
 * WHAT MAKES THIS SAFE TO REGENERATE. Everything produced here has to survive a
 * round trip: `renderPromptBlock` wraps it in the label and fence that
 * `parseValueChainMd` matches on, and the caller reads it straight back to check
 * the batch tool would still find it. A prompt that reads beautifully but does
 * not parse is worse than no prompt, because the failure only shows up when
 * someone tries to generate 140 diagrams from it.
 *
 * The model never sees the existing prompts — `chainNarrative` strips them —
 * so the output genuinely comes from the template and the narrative rather than
 * from the block that happened to sit nearby.
 *
 * Kept out of the route so the route stays thin, matching `staffNarrative.ts`.
 */
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { parseValueChainMd } from "./parseValueChainMd";
import {
  type MdPromptType, MD_PROMPT_LABEL, renderPromptBlock,
} from "./promptTemplates";
import type { SubprocessHeading } from "./chainSource";

/** One prompt to write. */
export interface PromptTarget {
  type: MdPromptType;
  /** The diagram this prompt is for — a chain for the four chain-level types, a
   *  subprocess for BPMN. */
  code: string;
  title: string;
}

/** Every prompt a chain needs: the four chain-level ones, then one per subprocess. */
export function targetsFor(
  chainCode: string, chainTitleText: string, subs: SubprocessHeading[], types: MdPromptType[],
): PromptTarget[] {
  const out: PromptTarget[] = [];
  for (const type of ["value-chain", "context", "process-context", "archimate"] as MdPromptType[]) {
    if (types.includes(type)) out.push({ type, code: chainCode, title: chainTitleText });
  }
  if (types.includes("bpmn")) {
    for (const s of subs) out.push({ type: "bpmn", code: s.code, title: s.title });
  }
  return out;
}

/** Cap the narrative sent per call. A chain narrative measures 6–7 KB, so this
 *  is headroom rather than a real limit — it exists so a malformed document
 *  cannot turn one click into a very large bill. */
const MAX_NARRATIVE_CHARS = 40_000;

/**
 * The user message: the chain in full, and which prompt is wanted from it.
 *
 * The whole subprocess list goes in every time, including for a single BPMN
 * prompt, because a BPMN prompt has to name the subprocess that follows it in
 * its end event — the existing prompts all do, and that cross-reference is what
 * makes the generated project navigable.
 */
export function buildUserMessage(args: {
  chainCode: string;
  chainTitle: string;
  narrative: string;
  subs: SubprocessHeading[];
  target: PromptTarget;
}): string {
  const { chainCode, chainTitle, narrative, subs, target } = args;
  const list = subs.length
    ? subs.map((s) => `- ${s.code} ${s.title}`).join("\n")
    : "(none declared in the document)";
  const asking = target.type === "bpmn"
    ? `Write the BPMN diagram prompt for the subprocess ${target.code} ${target.title}.`
    : `Write the ${MD_PROMPT_LABEL[target.type]} diagram prompt for the whole chain ${chainCode} ${chainTitle}.`;
  return [
    `VALUE CHAIN: ${chainCode} — ${chainTitle}`,
    "",
    "SUBPROCESSES OF THIS CHAIN, in order:",
    list,
    "",
    "NARRATIVE (the source of truth for teams, external participants, IT systems,",
    "policies, and information flows):",
    "",
    narrative.slice(0, MAX_NARRATIVE_CHARS),
    "",
    "---",
    asking,
  ].join("\n");
}

export type PromptResult =
  | { ok: true; prompt: string; block: string; roundTrips: boolean; parsedName: string | null }
  | { ok: false; error: string };

/**
 * Strip anything the model wrapped around the prompt despite being told not to.
 *
 * The template says "no markdown fences of your own", and models mostly comply —
 * but a stray ```text wrapper would end up nested inside the fence the block
 * renderer adds, which breaks the parse in a way that is tedious to spot by eye.
 * Cheaper to undo it here than to rely on instruction-following.
 */
export function stripWrapper(text: string): string {
  let s = text.replace(/\r\n/g, "\n").trim();
  const fence = s.match(/^```[a-zA-Z]*[ \t]*\n([\s\S]*?)\n?```$/);
  if (fence) s = fence[1].trim();
  // A leading "**X diagram prompt.**" label duplicates the one the block adds.
  s = s.replace(/^\*\*[^\n*]+diagram prompt\.\*\*[ \t]*\n+/i, "");
  return s.trim();
}

/**
 * Does this block survive `parseValueChainMd`?
 *
 * The check the whole feature rests on. A generated block is wrapped in a minimal
 * synthetic chain section and parsed exactly as the batch runner would, so what
 * is reported is what the batch runner will actually see — not a regex that
 * approximates it.
 */
export function roundTrip(chainCode: string, chainTitleText: string, type: MdPromptType, block: string): { ok: boolean; name: string | null } {
  const doc = `## ${chainCode} — ${chainTitleText}\n\n${
    type === "bpmn" ? `### ${chainCode}.01 — Round Trip Check\n\n` : ""
  }${block}\n`;
  const chains = parseValueChainMd(doc);
  const found = chains[0]?.diagrams.find((d) => d.type === type);
  return { ok: !!found && found.prompt.trim().length > 0, name: found?.name ?? null };
}

export async function generateMdPrompt(args: {
  apiKey: string;
  model: string;
  /** Built-in template + the organisation's additions, already assembled. */
  briefing: string;
  chainCode: string;
  chainTitle: string;
  narrative: string;
  subs: SubprocessHeading[];
  target: PromptTarget;
}): Promise<PromptResult> {
  const { apiKey, model, briefing, chainCode, chainTitle, narrative, subs, target } = args;
  if (!narrative.trim()) return { ok: false, error: "That chain has no narrative to write a prompt from" };

  const client = makeAiClient(model, apiKey);
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 4096,
      system: briefing,
      messages: [{ role: "user", content: buildUserMessage({ chainCode, chainTitle, narrative, subs, target }) }],
    });
    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") return { ok: false, error: "No response from the model" };
    const prompt = stripWrapper(textBlock.text);
    if (!prompt) return { ok: false, error: "The model returned an empty prompt" };
    const block = renderPromptBlock(target.type, prompt);
    const rt = roundTrip(chainCode, chainTitle, target.type, block);
    return { ok: true, prompt, block, roundTrips: rt.ok, parsedName: rt.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
