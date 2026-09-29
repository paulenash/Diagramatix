/**
 * The I/O for the prompt-link rule (app/lib/ai/applyGeneration.ts): carries out
 * a PromptLinkAction straight against the Prompt table. The ONE place it is
 * done — for the phone's generate job, and for the desktop through
 * POST /api/diagrams/[id]/prompt-link (promptLinkFetch.ts). Trimmed text, the
 * provenance POST /api/prompts accepts, planJson through pgPool (Prisma 7
 * cannot write Json), and "used" without touching updatedAt.
 *
 * WHO MAY WRITE WHICH PROMPT (2026-09-29). A prompt this code auto-creates for
 * a generation is BOUND to that diagram (Prompt.forDiagramId — set here, never
 * from a request). A bound prompt that belongs to the DIAGRAM'S CREATOR may be
 * updated by anyone the caller has already checked may edit the diagram: an
 * editor's re-generate keeps the owner's "<diagram> — AI prompt" current, and
 * the words land only in the library of someone who owns the diagram. A bound
 * prompt of anyone else is written only by that person; another caller gets a
 * prompt of their own, bound here. Renaming a prompt in the library unbinds it
 * (it is the user's own now). Any other prompt — a user's own saved one, or an
 * auto prompt made before binding existed — only its owner may write, as
 * before. What the diagram's JSON claims (aiGeneration.autoNamed/promptId)
 * never grants a write by itself.
 */
import { prisma, pgPool } from "@/app/lib/db";
import type { CreatePromptBody, LinkedPrompt, PlanJson, PromptLinkAction } from "./applyGeneration";

export interface PromptOwner { userId: string; orgId: string }
/** The diagram a generation is on, and who created it (the owner whose bound prompt its editors keep current). */
export interface PromptTarget { diagramId: string; diagramUserId: string }

async function writePlan(promptId: string, planJson: PlanJson | undefined): Promise<void> {
  if (planJson === undefined) return;
  await pgPool.query(
    `UPDATE "Prompt" SET "planJson" = $1::jsonb, "planUpdatedAt" = NOW() WHERE id = $2`,
    [JSON.stringify(planJson), promptId],
  );
}

async function createPromptRow(body: CreatePromptBody, owner: PromptOwner, target: PromptTarget): Promise<LinkedPrompt> {
  const row = await prisma.prompt.create({
    data: {
      name: body.name.trim(), text: body.text.trim(), diagramType: body.diagramType, userId: owner.userId, orgId: owner.orgId,
      forDiagramId: target.diagramId,
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
 * The prompts `owner`, generating on the target diagram, may write: one bound
 * to it that is their own or the diagram creator's, or an unbound one of their
 * own. The caller has checked edit access to the diagram first.
 */
function writableBy(owner: PromptOwner, target: PromptTarget) {
  return {
    OR: [
      { forDiagramId: target.diagramId, userId: { in: [owner.userId, target.diagramUserId] } },
      { forDiagramId: null, userId: owner.userId, orgId: owner.orgId },
    ],
  };
}

/**
 * Carry out the action for `owner` generating on the target diagram (edit
 * access already checked). A `link` to a prompt that is not theirs is never
 * made (the route has already checked; this is the backstop): a new one is
 * created instead. An `update` writes what writableBy allows; a DELETED one, one
 * bound to ANOTHER diagram (this one was copied from it), or one bound here that
 * is someone else's (not the diagram's creator's) is replaced by a new one of
 * the caller's, bound here; one that is another user's own keeps the link and
 * writes nothing. Returns the linked prompt, or null when none could be saved.
 */
export async function runPromptLinkDb(action: PromptLinkAction, owner: PromptOwner, target: PromptTarget): Promise<LinkedPrompt | null> {
  try {
    if (action.kind === "link") {
      const own = await prisma.prompt.findFirst({
        where: { id: action.linked.id, userId: owner.userId, orgId: owner.orgId },
        select: { id: true },
      });
      return own ? action.linked : await createPromptRow(action.orCreate, owner, target);
    }
    if (action.kind === "update") {
      const { count } = await prisma.prompt.updateMany({
        where: { id: action.linked.id, ...writableBy(owner, target) },
        data: { text: action.text.trim() },
      });
      if (count === 0) {
        // Not writable here. An unbound prompt of someone else's (their own, or
        // one made before binding) keeps the link and is left alone; a deleted
        // one, or one bound anywhere (another diagram, or here but someone
        // else's), is replaced by a prompt of the caller's, bound here.
        const row = await prisma.prompt.findUnique({ where: { id: action.linked.id }, select: { forDiagramId: true } });
        return row && !row.forDiagramId ? action.linked : await createPromptRow(action.orCreate, owner, target);
      }
      await writePlan(action.linked.id, action.planJson);
      return action.linked;
    }
    return await createPromptRow(action.body, owner, target);
  } catch (err) {
    console.error("[prompt-link] failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Count a generation against the prompt (POST /api/prompts/[id]/used's write):
 * the caller's own prompt, bound anywhere or not (counting a use is not
 * writing its words), or the diagram creator's prompt bound here. Never throws.
 */
export async function markPromptUsedDb(promptId: string, model: string, owner: PromptOwner, target: PromptTarget): Promise<void> {
  try {
    await pgPool.query(
      `UPDATE "Prompt"
          SET "useCount"   = "useCount" + 1,
              "lastUsedAt" = NOW(),
              "modelUsed"  = COALESCE($1, "modelUsed")
        WHERE id = $2
          AND (("userId" = $3 AND "orgId" = $4) OR ("forDiagramId" = $5 AND "userId" = $6))`,
      [model.trim() || null, promptId, owner.userId, owner.orgId, target.diagramId, target.diagramUserId],
    );
  } catch { /* a lost count must never cost somebody their diagram */ }
}
