/**
 * The phone's Generate (2026-09-28, mobile voice stage 1).
 *
 *   POST — start a server-side generate job for this BPMN diagram
 *          { prompt, version?, promptSource?, selectedPromptId?, sourceImageId?, replace? } → 202 { jobId, … }
 *          sourceImageId: a photo of a whiteboard the phone kept first
 *          (POST …/source-image) — stage 2; the words then CORRECT the photo.
 *          Or the image this diagram was generated from (its aiGeneration), for a re-generate.
 *          replace: true — stage 3's "✎ Correct": re-generate a diagram that HAS
 *          content, with a correction on the end of its prompt. Needs the version
 *          the phone holds, and saves only if the diagram is still that version.
 *          freeForm: with an image, reproduce its layout (app/lib/ai/freeForm.ts);
 *          a re-generate keeps the diagram's own choice unless it says otherwise.
 *   GET  — the caller's latest job on this diagram, so a phone that reloaded
 *          mid-generation picks the run up again → { job | null }
 *
 * The job plans, lays out, links the prompt and SAVES on the server
 * (app/lib/ai/generateJob.ts), so a phone that locks during the minute or two a
 * generation takes still gets its diagram. Poll GET …/generate/[jobId].
 *
 * Gates, in the plan route's order: signed in; not viewing someone read-only;
 * EDIT access (owners and editors — never a reviewer); a BPMN diagram; the AI
 * policy of the caller's org AND of the diagram's own; a configured model; the
 * AI-attempts cap. The diagram must be EMPTY (unless replace was asked for), and
 * still the version the phone holds. One run at a time per diagram — held
 * under a lock, so two taps at the same moment still start one.
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
import { correctionAdded, isWhiteboardPhotoPrompt } from "@/app/lib/ai/promptPreambles";
import { correctionRefusalText, correctionSource, type CorrectionSource } from "@/app/lib/mobile/correction";
import type { DiagramData } from "@/app/lib/diagram/types";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import { resolveUserAiKey } from "@/app/lib/ai/userAiKey";
import { resolveAiRouteContext } from "@/app/lib/ai/aiTelemetryRoute";
import { AI_INVOCATION_POINTS } from "@/app/lib/ai/aiTelemetry";
import { gateLimit } from "@/app/lib/subscription-route";
import {
  GENERATE_JOB_SELECT, MAX_GENERATE_PROMPT_CHARS, hasDiagramContent, reapStaleGenerateJobs, resolveJobSelectedPrompt,
  runGenerateJob, viewGenerateJob, type GenerateJobPromptMeta,
} from "@/app/lib/ai/generateJob";

export const dynamic = "force-dynamic";
// The POST answers at once; the run carries on in this process after it.
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

type JobRow = Awaited<ReturnType<typeof readActiveJob>>;
/** The run under way on this diagram, if any. */
function readActiveJob(db: Pick<typeof prisma, "diagramGenerateJob">, diagramId: string) {
  return db.diagramGenerateJob.findFirst({
    where: { diagramId, status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "desc" },
    select: GENERATE_JOB_SELECT,
  });
}

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
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  // Replacing content is only ever asked for, and only against a known version.
  const replace = body.replace === true;
  if (replace && typeof body.version !== "number") {
    return NextResponse.json({ error: "version_required", message: "Reload the diagram, then try again." }, { status: 400 });
  }
  // Otherwise the phone fills an EMPTY diagram; it never replaces content (stage 1).
  if (!replace && hasDiagramContent(diagram.data)) {
    return NextResponse.json({
      error: "has_content",
      message: "This diagram already has content. Generating on the phone fills an empty diagram.",
    }, { status: 409 });
  }
  // The AI policy of the caller's org, AND of the org the diagram belongs to —
  // its content is what goes to the AI, and a shared or elevated caller can be
  // working in another org's diagram.
  const pol = (await gateOrgPolicy(session, "allowAi")) ?? (await gateOrgPolicy(session, "allowAi", diagramOrgId));
  if (pol) return pol;

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
  // A replace is "✎ Correct": this diagram's own prompt with a correction on
  // the end, re-generated from its own image when it was drawn from one — by
  // the same rule the phone offers it by. Nothing else may replace content:
  // a diagram drawn from a document, an image that was not kept, or a Free
  // Form layout would come back as something else.
  let src: Extract<CorrectionSource, { ok: true }> | null = null;
  if (replace) {
    const s = correctionSource((diagram.data ?? {}) as unknown as DiagramData);
    if (!s.ok) return NextResponse.json({ error: s.reason, message: correctionRefusalText(s.reason) }, { status: 400 });
    src = s;
    if (correctionAdded(src.basePrompt, prompt) === null) {
      return NextResponse.json({ error: "not_a_correction", message: "This diagram changed since it was opened. Reload it, then try again." }, { status: 400 });
    }
    const sent = typeof body.sourceImageId === "string" && body.sourceImageId ? body.sourceImageId : null;
    if (sent !== src.sourceImageId) {
      return NextResponse.json({ error: "image_mismatch", message: "The image this diagram was drawn from was not sent. Reload it, then try again." }, { status: 400 });
    }
  }

  const promptOwnerIdForPhoto = getEffectiveUserId(session, cookieStore) ?? session.user.id; // whose prompts and photos these are
  // A second tap, or a reload: hand back the run already under way — its own
  // caller's, that is; anyone else is told it is busy.
  const callerId = session.user.id;
  const answerActive = async (active: NonNullable<JobRow>) => active.userId === callerId
    ? NextResponse.json({
      ...viewGenerateJob(active), selectedPrompt: await resolveJobSelectedPrompt(active, promptOwnerIdForPhoto),
      duplicate: true, pollAfterSeconds: 3,
    }, { status: 202 })
    : NextResponse.json({ error: "busy", message: "Someone else is generating this diagram right now." }, { status: 409 });

  await reapStaleGenerateJobs();
  // The quick answer; the create below checks again under a lock.
  const active = await readActiveJob(prisma, id);
  if (active) return answerActive(active);

  // The caller's OWN kept photo, in the diagram's organisation — never a
  // colleague's upload (naming it on this diagram would let everyone here see it).
  // The one exception: the image THIS diagram was generated from, which everyone
  // who can open the diagram can already see — a colleague's re-generate uses it.
  const diagramImageId = ((diagram.data ?? {}) as { aiGeneration?: { sourceImage?: { id?: unknown } } }).aiGeneration?.sourceImage?.id;
  let photo: { id: string; name: string; mimeType: string; width: number | null; height: number | null } | null = null;
  if (typeof body.sourceImageId === "string" && body.sourceImageId) {
    const ownImage = body.sourceImageId === diagramImageId;
    photo = await prisma.aiSourceImage.findFirst({
      where: { id: body.sourceImageId, orgId: diagramOrgId, ...(ownImage ? {} : { createdById: promptOwnerIdForPhoto }) },
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

  // Free Form (an image's layout reproduced) only with an image. A re-generate
  // keeps the diagram's own choice unless the request says otherwise.
  const freeForm = !!photo && (typeof body.freeForm === "boolean" ? body.freeForm : (src?.freeForm ?? false));

  // Where the words came from. A saved prompt is looked up, not trusted: it
  // links only if it is the caller's own and the text is still unchanged.
  const promptMeta: GenerateJobPromptMeta = {
    ...(body.promptSource === "dictated" || body.promptSource === "typed" ? { promptSource: body.promptSource } : {}),
    // Recorded either way, so a later ✎ Correct knows (no document on the phone).
    promptFromImage: !!photo,
    promptFromDocument: false,
    // A photo: drawn from an image, laid out normally or — Free Form — as drawn
    // (recorded, so a later re-generate here or on the desktop starts with the
    // same choice), and kept with the diagram.
    ...(photo ? {
      freeForm,
      sourceImage: {
        name: photo.name, mediaType: photo.mimeType, storedId: photo.id,
        ...(photo.width ? { width: photo.width } : {}),
        ...(photo.height ? { height: photo.height } : {}),
      },
    } : {}),
  };
  // A photo run is the photo plus the words: it never links a saved prompt.
  let selected: { id: string; name: string; text: string } | null = null;
  if (!photo && typeof body.selectedPromptId === "string" && body.selectedPromptId) {
    selected = await prisma.prompt.findFirst({
      where: { id: body.selectedPromptId, userId: promptOwnerId, orgId },
      select: { id: true, name: true, text: true },
    });
    if (selected) {
      promptMeta.selectedPromptId = selected.id;
      promptMeta.selectedPromptName = selected.name;
      promptMeta.selectedPromptUnchanged = selected.text.trim() === prompt;
    }
  }

  // One run per diagram: the check and the create hold a lock on this diagram,
  // so two taps at the same moment start ONE run (the other is handed it, or
  // told it is busy). Read Committed, so the second sees the first's row.
  const started = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"dgx:generate:" + id}, 0))`;
    const already = await readActiveJob(tx, id);
    if (already) return { kind: "busy" as const, already };
    const job = await tx.diagramGenerateJob.create({
      data: {
        diagramId: id, userId: callerId, orgId, promptText: prompt, sourceImageId: photo?.id ?? null,
        // Kept with the run, so a failed one tried again after a reload is the same run.
        selectedPromptId: selected?.id ?? null, freeForm,
      },
      select: GENERATE_JOB_SELECT,
    });
    return { kind: "started" as const, job };
  });
  if (started.kind === "busy") return answerActive(started.already);
  const { job } = started;
  // The worker starts only now, once the row is committed.
  // Deliberately NOT awaited: the phone gets its 202 now. Every path inside
  // ends in succeed or fail, so a rejection cannot escape.
  void runGenerateJob({
    jobId: job.id, diagramId: id, userId: session.user.id, promptOwnerId, orgId,
    aiContext, ownKey, model, apiKey, prompt, promptMeta, baseVersion: diagram.version,
    diagramOrgId, ...(photo ? { sourceImageId: photo.id } : {}), ...(replace ? { replace: true } : {}),
  }).catch((e) => console.error(`[generate-job] ${job.id} escaped:`, e));

  return NextResponse.json({ ...viewGenerateJob(job), selectedPrompt: selected, pollAfterSeconds: 3 }, { status: 202 });
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
    select: GENERATE_JOB_SELECT,
  });
  if (!job) return NextResponse.json({ job: null });
  const ownerId = getEffectiveUserId(session, await cookies()) ?? session.user.id;
  return NextResponse.json({ job: { ...viewGenerateJob(job), selectedPrompt: await resolveJobSelectedPrompt(job, ownerId) } });
}
