import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { latestTemplateVersion, MD_PROMPT_TYPES, type MdPromptType } from "@/app/lib/valueChain/promptTemplates";
import { processCodeForDiagram } from "@/app/lib/valueChain/diagramSource";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/diagrams/[id]/freshness — the LIBRARY's side of "is this diagram
 * still a picture of its prompt?".
 *
 * Deliberately not the answer, only the half of it the browser cannot know.
 *
 * Paul, 2026-09-06: "This does not go away after diagram is regenerated, it does
 * go away after leaving and re-entering the diagram." The whole judgement used
 * to be made here, and this reads the diagram from the DATABASE — so after an
 * in-editor regeneration it truthfully answered a question about the PREVIOUS
 * version, and went on doing so until the debounced auto-save landed. The
 * editor knows its own generation timestamp the instant it happens; only when
 * the prompt was last regenerated has to be fetched. So that is all this
 * returns, and the editor decides.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const diagram = await prisma.diagram.findUnique({ where: { id }, select: { name: true, type: true, data: true } });
  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const data = (diagram.data as Record<string, unknown>) ?? {};
  const gen = (data.aiGeneration as Record<string, unknown> | undefined) ?? undefined;

  const type: MdPromptType = MD_PROMPT_TYPES.includes(diagram.type as MdPromptType)
    ? (diagram.type as MdPromptType) : "bpmn";
  const empty = {
    promptRegeneratedAt: null, currentTemplateVersion: latestTemplateVersion(type).version,
    processCode: null, checkedPromptId: null, checkedPromptHasPlan: false,
  };
  if (!gen) return NextResponse.json(empty);

  // The stamp is authoritative where it exists; the name is the fallback that
  // makes every diagram generated BEFORE the stamp shipped answerable too —
  // which is the whole population being asked about.
  const source = (gen.source as Record<string, unknown> | undefined) ?? undefined;
  const processCode = typeof source?.processCode === "string" && source.processCode
    ? source.processCode
    : processCodeForDiagram(diagram.name);

  let promptRegeneratedAt: string | null = null;
  if (processCode) {
    const row = await prisma.valueChainPrompt.findFirst({
      where: { type, processCode },
      select: { generatedAt: true },
      orderBy: { generatedAt: "desc" },
    });
    promptRegeneratedAt = row?.generatedAt?.toISOString() ?? null;
  }

  /**
   * Whether the linked Prompt carries a plan.
   *
   * The editor stored the plan on `Prompt.planJson` and not on the diagram, so
   * a diagram regenerated there has one — just not where the diagram can see
   * it. Reporting that here stops it being told it has no plan when it has.
   * The id is returned with it so the editor can tell whether the answer still
   * applies to the prompt it is currently linked to.
   */
  const checkedPromptId = typeof gen.promptId === "string" ? gen.promptId : null;
  let checkedPromptHasPlan = false;
  if (checkedPromptId) {
    const p = await prisma.prompt.findUnique({ where: { id: checkedPromptId }, select: { planJson: true } });
    checkedPromptHasPlan = !!p?.planJson;
  }

  return NextResponse.json({
    promptRegeneratedAt,
    currentTemplateVersion: latestTemplateVersion(type).version,
    processCode: processCode || null,
    checkedPromptId,
    checkedPromptHasPlan,
  });
}
