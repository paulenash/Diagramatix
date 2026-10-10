import { prisma } from "@/app/lib/db";
import { makeAiClient } from "@/app/lib/ai/anthropicClient";
import { hashText } from "./promptStamp";
import {
  CHAIN_NARRATIVE_CATEGORY, buildChainNarrativeBriefing, chainNarrativeUserMessage, validateBuiltNarrative, parseProcessSuggestions,
  SUGGEST_PROCESSES_SYSTEM, latestChainNarrativeVersion, type BriefInput, type SuggestedProcess,
} from "./chainNarrative";

/**
 * The two AI calls behind "Create a New Value Chain" that come BEFORE any chain exists: proposing the process list, and building the
 * structured narrative (the sixth master template, chainNarrative.ts). Both take a `complete` seam so the tests never call a model.
 */

/** A single model call: system + user in, the text out. The default talks to the model; tests replace it. */
export type Complete = (args: { system: string; user: string; maxTokens: number }) => Promise<{ text: string; ranOut: boolean }>;

export function modelComplete(apiKey: string, model: string): Complete {
  return async ({ system, user, maxTokens }) => {
    const msg = await makeAiClient(model, apiKey).messages.create({
      model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }],
    });
    const block = msg.content.find((b) => b.type === "text");
    return { text: block && block.type === "text" ? block.text : "", ranOut: (msg as { stop_reason?: string }).stop_reason === "max_tokens" };
  };
}

/** First attempt, then one retry with double the room — the same ladder the prompt writer uses (generatePrompt.ts). */
export const NARRATIVE_TOKEN_LIMITS = [8192, 16384] as const;

/** Strip an accidental code fence round the whole answer. */
export function stripNarrativeFence(text: string): string {
  let s = (text ?? "").trim();
  if (s.startsWith("```")) s = s.replace(/^```(?:markdown|md)?\n?/, "").replace(/\n?```$/, "").trim();
  return s;
}

/**
 * Propose 5-12 processes from the author's description. Returns null (never throws) when the model gave nothing usable, so the wizard can
 * say "write your own list" rather than fail.
 */
export async function suggestProcesses(args: { title: string; generalNarrative: string; complete: Complete }): Promise<SuggestedProcess[] | null> {
  const user = `CHAIN NAME: ${args.title}\n\nAUTHOR'S DESCRIPTION:\n${args.generalNarrative.slice(0, 14_000)}\n\nReturn ONLY the JSON object. No prose, no markdown fences.`;
  try {
    const { text } = await args.complete({ system: SUGGEST_PROCESSES_SYSTEM, user, maxTokens: 2048 });
    return parseProcessSuggestions(text);
  } catch {
    return null;
  }
}

export type BuiltNarrative =
  | { ok: true; narrative: string; templateVersion: number; additionsHash: string }
  | { ok: false; error: string };

/**
 * Build the structured narrative for `code` from the author's brief. Checked against the contract (heading, nine parts, one subsection per
 * process with the exact name); a failed check gets ONE correction round that tells the model what was wrong, then an honest error.
 */
export async function buildChainNarrative(args: { code: string; brief: BriefInput; additions: string; complete: Complete }): Promise<BuiltNarrative> {
  const system = buildChainNarrativeBriefing(args.additions);
  const base = chainNarrativeUserMessage({ code: args.code, brief: args.brief });
  const meta = { templateVersion: latestChainNarrativeVersion().version, additionsHash: hashText((args.additions ?? "").trim()) };
  let user = base;
  let lastProblems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let text = "";
    for (const maxTokens of NARRATIVE_TOKEN_LIMITS) {
      const r = await args.complete({ system, user, maxTokens });
      text = r.text;
      if (text.trim() && !r.ranOut) break;
    }
    const narrative = stripNarrativeFence(text);
    if (!narrative) return { ok: false, error: "The model returned nothing. Try again." };
    lastProblems = validateBuiltNarrative(narrative, args.code, args.brief);
    if (lastProblems.length === 0) return { ok: true, narrative, ...meta };
    user = `${base}\n\nYOUR PREVIOUS ANSWER BROKE THE OUTPUT CONTRACT. Fix exactly these and return the complete narrative again:\n- ${lastProblems.join("\n- ")}`;
  }
  return { ok: false, error: `The narrative could not be built to the required shape: ${lastProblems.slice(0, 3).join(" ")}` };
}

/**
 * The house-rule additions for the narrative template: the SuperAdmin's (master) row, then this Org's own — the same layering the five
 * prompt templates use (libraryAdmin.ts). "" when there are none.
 */
export async function loadNarrativeAdditions(orgId: string): Promise<string> {
  const master = await prisma.diagramRules.findFirst({ where: { category: CHAIN_NARRATIVE_CATEGORY, isDefault: true }, select: { rules: true } }).catch(() => null);
  const org = orgId
    ? await prisma.diagramRules.findFirst({ where: { category: CHAIN_NARRATIVE_CATEGORY, orgId, userId: null }, select: { rules: true } }).catch(() => null)
    : null;
  return [master?.rules, org?.rules].filter(Boolean).join("\n\n");
}
