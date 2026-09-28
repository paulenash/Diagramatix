/**
 * The desktop's I/O for the prompt-link rule (app/lib/ai/applyGeneration.ts):
 * carries out a PromptLinkAction through the /api/prompts routes. The server
 * job's counterpart is promptLinkDb.ts — same actions, straight to the table.
 */
import type { CreatePromptBody, LinkedPrompt, PromptLinkAction } from "./applyGeneration";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function createPrompt(body: CreatePromptBody, fetchImpl: typeof fetch): Promise<LinkedPrompt | null> {
  const { source, fromImage, refined, ...rest } = body;
  const provenance = { ...(source ? { source } : {}), ...(fromImage ? { fromImage } : {}), ...(refined ? { refined } : {}) };
  const res = await fetchImpl("/api/prompts", {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ ...rest, ...provenance }),
  });
  if (!res.ok) return null;
  const created = await res.json();
  return { id: created.id as string, name: (created.name as string) ?? body.name, autoNamed: true };
}

/**
 * Carry out the action; the prompt this diagram is now linked to, or null when
 * none could be saved. A `link` needs no write — the saved prompt came from the
 * caller's own list. An `update` whose prompt has been DELETED (404 `gone`)
 * creates a fresh one instead of keeping a link nobody can open; any other
 * failure — including a prompt that is another editor's — keeps the link.
 */
export async function runPromptLinkFetch(
  action: PromptLinkAction,
  fetchImpl: typeof fetch = fetch,
): Promise<LinkedPrompt | null> {
  try {
    if (action.kind === "link") return action.linked;
    if (action.kind === "update") {
      const res = await fetchImpl(`/api/prompts/${action.linked.id}`, {
        method: "PUT", headers: JSON_HEADERS,
        body: JSON.stringify({ text: action.text, ...(action.planJson ? { planJson: action.planJson } : {}) }),
      });
      if (res.status !== 404) return action.linked;
      const why = await res.json().catch(() => ({}));
      if ((why as { gone?: unknown }).gone !== true) return action.linked;
      return await createPrompt(action.orCreate, fetchImpl);
    }
    return await createPrompt(action.body, fetchImpl);
  } catch { return null; }
}

/**
 * Count a generation against the prompt it came from. Fire-and-forget: the
 * diagram is already on screen, and losing a count must never cost somebody
 * their work.
 */
export function markPromptUsedFetch(promptId: string, model: string, fetchImpl: typeof fetch = fetch): void {
  void fetchImpl(`/api/prompts/${promptId}/used`, {
    method: "POST", headers: JSON_HEADERS,
    body: JSON.stringify({ model }),
  }).catch(() => {});
}
