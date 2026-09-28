/**
 * The phone's Generate (2026-09-28, mobile voice stage 1).
 *
 *   POST — start a server-side generate job for this BPMN diagram
 *          { prompt, version?, promptSource?, selectedPromptId?, sourceImageId? } → 202 { jobId, … }
 *          sourceImageId: a photo of a whiteboard the phone kept first
 *          (POST …/source-image) — stage 2; the words then CORRECT the photo.
 *   GET  — the caller's latest job on this diagram, so a phone that reloaded
 *          mid-generation picks the run up again → { job | null }
 *
 * The job plans, lays out, links the prompt and SAVES on the server
 * (app/lib/ai/generateJob.ts), so a phone that locks during the minute or two a
 * generation takes still gets its diagram. Poll GET …/generate/[jobId].
 *
 * Gates, in the plan route's order: signed in; not viewing someone read-only;
 * EDIT access (owners and editors — never a reviewer); a BPMN diagram; the
 * org's AI policy; a configured model; the AI-attempts cap. The diagram must be
 * EMPTY, and still the version the phone holds. One run at a time per diagram.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { modelVision } from "@/app/lib/ai/models";
import { isWhiteboardPhotoPrompt } from "@/app/lib/ai/promptPreambles";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveUserAiKey } from "@/app/lib/ai/userAiKey";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { gateLimit } from "@/app/lib/subscription-route";
import {
  MAX_GENERATE_PROMPT_CHARS, hasDiagramContent, reapStaleGenerateJobs, runGenerateJob, viewGenerateJob,
  type GenerateJobPromptMeta,
} from "@/app/lib/ai/generateJob";

export const dynamic = "force-dynamic";
// The POST answers at once; the run carries on in this process after it.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const JOB_SELECT = {
  id: true, userId: true, status: true, stage: true, promptText: true, version: true,
  errorCode: true, errorMessage: true, startedAt: true, finishedAt: true, sourceImageId: true,
} as const;

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A SuperAdmin viewing as someone must not generate — and spend AI — as them.
  const ro = await blockReadOnlyImpersonation(session);
  if (ro) return ro;
  const { id } = await params;
  const cookieStore = await cookies();
  let diagramOrgId: string;
  try {
    diagramOrgId = (await requireDiagramAccess(session, cookieStore, id, "edit")).diagram.orgId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const diagram = await prisma.diagram.findUnique({ where: { id }, select: { type: true, version: true, data: true } });
  if (!diagram) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (diagram.type !== "bpmn") {
    return NextResponse.json({ error: "Only BPMN diagrams can be generated on the phone." }, { status: 400 });
  }
  // The phone fills an EMPTY diagram; it never replaces content (stage 1).
  if (hasDiagramContent(diagram.data)) {
    return NextResponse.json({
      error: "has_content",
      message: "This diagram already has content. Generating on the phone fills an empty diagram.",
    }, { status: 409 });
  }
  const pol = await gateOrgPolicy(session, "allowAi");
  if (pol) return pol;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  if (prompt.length > MAX_GENERATE_PROMPT_CHARS) {
    return NextResponse.json({ error: `The prompt is too long (over ${MAX_GENERATE_PROMPT_CHARS.toLocaleString("en-AU")} characters).` }, { status: 413 });
  }
  // The phone's copy must be the current one: generating over a diagram that
  // changed elsewhere since it was opened would replace that change unseen.
  if (typeof body.version === "number" && body.version !== diagram.version) {
    return NextResponse.json({
      error: "conflict",
      message: "This diagram changed on another device. Reload it, then generate.",
      currentVersion: diagram.version,
    }, { status: 409 });
  }

  await reapStaleGenerateJobs();
  const active = await prisma.diagramGenerateJob.findFirst({
    where: { diagramId: id, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: JOB_SELECT,
  });
  if (active) {
    // A second tap, or a reload: hand back the run already under way.
    if (active.userId === session.user.id) {
      return NextResponse.json({ ...viewGenerateJob(active), duplicate: true, pollAfterSeconds: 3 }, { status: 202 });
    }
    return NextResponse.json({ error: "busy", message: "Someone else is generating this diagram right now." }, { status: 409 });
  }

  // The caller's OWN kept photo, in the diagram's organisation — never a
  // colleague's upload (naming it on this diagram would let everyone here see it).
  const promptOwnerIdForPhoto = getEffectiveUserId(session, cookieStore) ?? session.user.id; // whose prompts and photos these are
  let photo: { id: string; name: string; mimeType: string; width: number | null; height: number | null } | null = null;
  if (typeof body.sourceImageId === "string" && body.sourceImageId) {
    photo = await prisma.aiSourceImage.findFirst({
      where: { id: body.sourceImageId, orgId: diagramOrgId, createdById: promptOwnerIdForPhoto },
      select: { id: true, name: true, mimeType: true, width: true, height: true },
    });
    if (!photo) {
      return NextResponse.json({ error: "image_gone", message: "The photo could not be found. Take it again, then generate." }, { status: 400 });
    }
  }

  // A prompt written for a photo (a saved one picked again) is not run without
  // it: the model would be told about a photo it never gets.
  if (!photo && isWhiteboardPhotoPrompt(prompt)) {
    return NextResponse.json({ error: "photo_needed", message: "This prompt was written for a whiteboard photo — take the photo, then generate." }, { status: 400 });
  }

  // The default model, as the partner API uses: no picker on the phone. A photo
  // uses the vision model when one is set, as the consoles do.
  const model = await resolveGenerateModel(!!photo);
  if (photo && modelVision(model) === false) {
    return NextResponse.json({ error: "Photos need an AI model that can read images. An administrator can set one under AI Model → Vision model." }, { status: 503 });
  }
  // The caller's OWN key wins when they have supplied one for this provider.
  const ownKey = await resolveUserAiKey(session.user.id, model);
  const apiKey = ownKey?.apiKey ?? aiApiKey(model);
  if (!apiKey) {
    return NextResponse.json({ error: "AI is not configured for the selected model. An administrator can add a key for this provider, or you can add your own under Account Settings → Your own AI keys." }, { status: 503 });
  }
  // Checked BEFORE the model call, as the plan route does; counted by the job
  // only once a plan has come back.
  const aiBlock = await gateLimit(session.user.id, "aiAttempts");
  if (aiBlock) return aiBlock;

  // Request-scoped values are resolved here: the job outlives the request.
  const aiContext = await resolveAiRouteContext(session, AI_INVOCATION_POINTS.MobileGenerate);
  const orgId = aiContext.orgId ?? diagramOrgId;
  const promptOwnerId = promptOwnerIdForPhoto;

  // Where the words came from. A saved prompt is looked up, not trusted: it
  // links only if it is the caller's own and the text is still unchanged.
  const promptMeta: GenerateJobPromptMeta = {
    ...(body.promptSource === "dictated" || body.promptSource === "typed" ? { promptSource: body.promptSource } : {}),
    // A photo: drawn from an image, laid out normally (Free Form off — recorded,
    // so a desktop re-generate starts with it off too), and kept with the diagram.
    ...(photo ? {
      promptFromImage: true,
      freeForm: false,
      sourceImage: {
        name: photo.name, mediaType: photo.mimeType, storedId: photo.id,
        ...(photo.width ? { width: photo.width } : {}),
        ...(photo.height ? { height: photo.height } : {}),
      },
    } : {}),
  };
  // A photo run is the photo plus the words: it never links a saved prompt.
  if (!photo && typeof body.selectedPromptId === "string" && body.selectedPromptId) {
    const sel = await prisma.prompt.findFirst({
      where: { id: body.selectedPromptId, userId: promptOwnerId, orgId },
      select: { id: true, name: true, text: true },
    });
    if (sel) {
      promptMeta.selectedPromptId = sel.id;
      promptMeta.selectedPromptName = sel.name;
      promptMeta.selectedPromptUnchanged = sel.text.trim() === prompt;
    }
  }

  const job = await prisma.diagramGenerateJob.create({
    data: { diagramId: id, userId: session.user.id, orgId, promptText: prompt, sourceImageId: photo?.id ?? null },
    select: JOB_SELECT,
  });
  // Deliberately NOT awaited: the phone gets its 202 now. Every path inside
  // ends in succeed or fail, so a rejection cannot escape.
  void runGenerateJob({
    jobId: job.id, diagramId: id, userId: session.user.id, promptOwnerId, orgId,
    aiContext, ownKey, model, apiKey, prompt, promptMeta, baseVersion: diagram.version,
    diagramOrgId, ...(photo ? { sourceImageId: photo.id } : {}),
  }).catch((e) => console.error(`[generate-job] ${job.id} escaped:`, e));

  return NextResponse.json({ ...viewGenerateJob(job), pollAfterSeconds: 3 }, { status: 202 });
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  await reapStaleGenerateJobs();
  // Only the caller's own runs: the prompt text in one is theirs alone.
  const job = await prisma.diagramGenerateJob.findFirst({
    where: { diagramId: id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: JOB_SELECT,
  });
  return NextResponse.json({ job: job ? viewGenerateJob(job) : null });
}
