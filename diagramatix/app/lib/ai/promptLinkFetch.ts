/**
 * The desktop's I/O for the prompt-link rule (app/lib/ai/applyGeneration.ts):
 * hands the decided PromptLinkAction to POST /api/diagrams/[id]/prompt-link,
 * which carries it out with the server's own code (promptLinkDb.ts — the same
 * code the phone's generate job runs) and counts the generation against the
 * prompt. One place decides who may write which prompt; this is only the fetch.
 */
import type { LinkedPrompt, PromptLinkAction } from "./applyGeneration";

/**
 * Carry out the action for this diagram; the prompt it is now linked to, or
 * null when none could be saved. If the server cannot be reached, a `link` or
 * `update` keeps the link it had (nothing is lost), and a `create` is null.
 */
export async function runPromptLinkFetch(
  action: PromptLinkAction,
  diagramId: string,
  model?: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedPrompt | null> {
  const fallback = action.kind === "create" ? null : action.linked;
  try {
    const res = await fetchImpl(`/api/diagrams/${diagramId}/prompt-link`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...(model ? { model } : {}) }),
    });
    if (!res.ok) return fallback;
    const j = (await res.json().catch(() => ({}))) as { linked?: LinkedPrompt | null };
    return j.linked ?? null;
  } catch { return fallback; }
}
