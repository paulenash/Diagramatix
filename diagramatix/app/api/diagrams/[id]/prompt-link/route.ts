/**
 * POST /api/diagrams/[id]/prompt-link — link (or auto-save) the Prompt a
 * desktop generation on this diagram came from, and count the generation
 * against it (2026-09-29).
 *
 *   { action: PromptLinkAction, model? } → { linked: LinkedPrompt | null }
 *
 * The desktop decides the action with the shared rule (applyGeneration.ts
 * decidePromptLink); the server carries it out with promptLinkDb.ts — the same
 * code the phone's generate job runs — so WHO MAY WRITE WHICH PROMPT is decided
 * in one place: the diagram creator's prompt bound to this diagram by whoever
 * may edit the diagram, anything else only by its owner. That is why this needs EDIT access
 * to the diagram, and why the action is re-validated here rather than trusted.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, getCurrentOrgId, OrgContextError } from "@/app/lib/auth/orgContext";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { parsePromptLinkAction } from "@/app/lib/ai/applyGeneration";
import { markPromptUsedDb, runPromptLinkDb } from "@/app/lib/ai/promptLinkDb";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ro = await blockReadOnlyImpersonation(session);
  if (ro) return ro;
  const { id } = await params;
  const cookieStore = await cookies();
  let orgId: string;
  try {
    await requireDiagramAccess(session, cookieStore, id, "edit");
    // Whose prompts these are: the caller's, in their current org — as /api/prompts lists them.
    orgId = await getCurrentOrgId(session, cookieStore);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const owner = { userId: getEffectiveUserId(session, cookieStore) ?? session.user.id, orgId };

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const action = parsePromptLinkAction(body.action);
  if (!action) return NextResponse.json({ error: "Invalid prompt-link action" }, { status: 400 });

  const diagram = await prisma.diagram.findUnique({ where: { id }, select: { userId: true } });
  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const target = { diagramId: id, diagramUserId: diagram.userId };
  const linked = await runPromptLinkDb(action, owner, target);
  if (linked && typeof body.model === "string" && body.model.trim()) {
    await markPromptUsedDb(linked.id, body.model, owner, target);
  }
  return NextResponse.json({ linked });
}
