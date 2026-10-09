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
import { looksTruncated } from "./checkPromptTruncated";
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
  /** The author's answers to the clarifying questions, already formatted (promptQuestions.answersBlock). */
  answers?: string;
  /** The organisation's own entity names (org units, roles, systems), already formatted, when the author asked to align to them. */
  entityNames?: string;
}): string {
  const { chainCode, chainTitle, narrative, subs, target, answers, entityNames } = args;
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
    ...(entityNames ? [
      "THE ORGANISATION'S OWN NAMES — where a lane, role or system in the narrative matches one of these, use the organisation's name exactly;",
      "do not invent names that are not in the narrative or in this list:",
      entityNames,
      "",
    ] : []),
    ...(answers ? [answers, ""] : []),
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

/** First attempt, then one retry with double the room (see generateMdPrompt). Exported so a test can pin the ladder. */
export const PROMPT_TOKEN_LIMITS = [16384, 32768] as const;

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
  /** See buildUserMessage. */
  answers?: string;
  entityNames?: string;
}): Promise<PromptResult> {
  const { apiKey, model, briefing, chainCode, chainTitle, narrative, subs, target, answers, entityNames } = args;
  if (!narrative.trim()) return { ok: false, error: "That chain has no narrative to write a prompt from" };

  const client = makeAiClient(model, apiKey);
  try {
    // 4096 was truncating real prompts: 7 of 35 calls in one V22 run stopped
    // on max_tokens, and 6 of its 10 prompts were saved half-written (Paul,
    // 2026-09-04). Headroom is cheap; a silently half-described process is not.
    // 8192 then 16384 were not enough once the v9 template, the question answers and models that reason before answering were
    // combined (V01.05, V01.07; Haiku 5.5 at maximum detail, 2026-10-09). So: try 16384, and if the model ran out of room — or
    // used it all thinking and wrote nothing — ONE retry with double the room. Only a run that fails both is reported.
    const userMessage = buildUserMessage({ chainCode, chainTitle, narrative, subs, target, answers, entityNames });
    let message: Awaited<ReturnType<typeof client.messages.create>> | null = null;
    let textBlock: { type: string; text?: string } | undefined;
    for (const max_tokens of PROMPT_TOKEN_LIMITS) {
      message = await client.messages.create({ model, max_tokens, system: briefing, messages: [{ role: "user", content: userMessage }] });
      textBlock = message.content.find((b) => b.type === "text");
      const ranOut = (message as { stop_reason?: string }).stop_reason === "max_tokens";
      if (textBlock && !ranOut) break;
    }
    if (!message || !textBlock || textBlock.type !== "text" || typeof textBlock.text !== "string") return { ok: false, error: "No response from the model" };
    // A response that ran out of room is HALF A PROMPT, and half a prompt reads
    // as a whole one: V22.07 was saved and published ending on `- branch "` and
    // every existing check passed it. Refuse it here, where the stop reason is
    // still known, rather than discover it as a diagram missing its decline path.
    if ((message as { stop_reason?: string }).stop_reason === "max_tokens") {
      return { ok: false, error: "The model ran out of room and stopped mid-prompt — regenerate it (the partial text was NOT saved)" };
    }
    const prompt = stripWrapper(textBlock.text);
    if (!prompt) return { ok: false, error: "The model returned an empty prompt" };
    // Belt and braces: truncation also arrives without a stop reason to consult
    // — a dropped stream, a proxy cutting the response — and the shape of the
    // text gives it away either way.
    const cut = looksTruncated(prompt);
    if (cut) return { ok: false, error: `The prompt came back unfinished: ${cut}. It was NOT saved — regenerate it.` };
    const block = renderPromptBlock(target.type, prompt);
    const rt = roundTrip(chainCode, chainTitle, target.type, block);
    return { ok: true, prompt, block, roundTrips: rt.ok, parsedName: rt.name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
