/**
 * The server's I/O for the prompt-link rule (app/lib/ai/applyGeneration.ts):
 * carries out a PromptLinkAction straight against the Prompt table, for the
 * phone's generate job. The desktop does the same through /api/prompts
 * (promptLinkFetch.ts); the writes here mirror those routes — trimmed text, the
 * provenance they accept, planJson through pgPool (Prisma 7 cannot write Json),
 * and "used" without touching updatedAt.
 */
import { prisma, pgPool } from "@/app/lib/db";
import type { CreatePromptBody, LinkedPrompt, PlanJson, PromptLinkAction } from "./applyGeneration";

export interface PromptOwner { userId: string; orgId: string }

async function writePlan(promptId: string, planJson: PlanJson | undefined): Promise<void> {
  if (planJson === undefined) return;
  await pgPool.query(
    `UPDATE "Prompt" SET "planJson" = $1::jsonb, "planUpdatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify(planJson), promptId],
  );
}

async function createPromptRow(body: CreatePromptBody, owner: PromptOwner): Promise<LinkedPrompt> {
  const row = await prisma.prompt.create({
    data: {
      name: body.name.trim(), text: body.text.trim(), diagramType: body.diagramType, userId: owner.userId, orgId: owner.orgId,
      ...(body.source === "typed" || body.source === "dictated" ? { source: body.source } : {}),
      ...(body.fromImage === true ? { fromImage: true } : {}),
      ...(body.refined === true ? { refinedAt: new Date() } : {}),
    },
    select: { id: true, name: true },
  });
  await writePlan(row.id, body.planJson);
  return { id: row.id, name: row.name, autoNamed: true };
}

/**
 * Carry out the action for `owner` — every write is scoped to their own
 * prompts. A `link` to a prompt that is not theirs is never made (the route has
 * already checked; this is the backstop): a new one is created instead. An
 * `update` of a prompt that is another editor's keeps the link and writes
 * nothing; only a DELETED one is replaced. Returns the linked prompt, or null
 * when none could be saved.
 */
export async function runPromptLinkDb(action: PromptLinkAction, owner: PromptOwner): Promise<LinkedPrompt | null> {
  try {
    if (action.kind === "link") {
      const own = await prisma.prompt.findFirst({
        where: { id: action.linked.id, userId: owner.userId, orgId: owner.orgId },
        select: { id: true },
      });
      return own ? action.linked : await createPromptRow(action.orCreate, owner);
    }
    if (action.kind === "update") {
      const { count } = await prisma.prompt.updateMany({
        where: { id: action.linked.id, userId: owner.userId, orgId: owner.orgId },
        data: { text: action.text.trim() },
      });
      if (count === 0) {
        const exists = await prisma.prompt.findUnique({ where: { id: action.linked.id }, select: { id: true } });
        return exists ? action.linked : await createPromptRow(action.orCreate, owner);
      }
      await writePlan(action.linked.id, action.planJson);
      return action.linked;
    }
    return await createPromptRow(action.body, owner);
  } catch (err) {
    console.error("[generate-job] prompt link failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** Count a generation against the prompt (POST /api/prompts/[id]/used's write). Never throws. */
export async function markPromptUsedDb(promptId: string, model: string, owner: PromptOwner): Promise<void> {
  try {
    await pgPool.query(
      `UPDATE "Prompt"
          SET "useCount"   = "useCount" + 1,
              "lastUsedAt" = NOW(),
              "modelUsed"  = COALESCE($1, "modelUsed")
        WHERE id = $2 AND "userId" = $3 AND "orgId" = $4`,
      [model.trim() || null, promptId, owner.userId, owner.orgId],
    );
  } catch { /* a lost count must never cost somebody their diagram */ }
}
