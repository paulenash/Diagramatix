/**
 * The phone's Generate, run ON THE SERVER (2026-09-28, mobile voice stage 1).
 *
 * A generation takes a minute or two, and a phone locks its screen. Done the
 * desktop way — plan in one request, lay out in another, save from the page — a
 * lock mid-way loses the result after the tokens are spent. So the whole run
 * happens here: plan → lay out → link the prompt → save, and the phone only
 * polls. A phone that wakes up (or reloads) finds its diagram already saved.
 *
 * The worker runs in the POST's own process, unawaited — the Partner API's
 * pattern (app/lib/partner/worker.ts). An Azure restart mid-run leaves a
 * `running` row nothing will finish; `reapStaleGenerateJobs` turns those into
 * honest failures. Every path ends in succeed or fail, and a failure's message
 * is written for the user, never a raw exception string.
 *
 * The steps are the desktop's own, shared rather than copied: planBpmn (as
 * POST /api/ai/bpmn/plan), layoutBpmnPlan (as apply-layout), and the
 * link-and-save rules in applyGeneration.ts (as DiagramEditor.applyAiResult).
 */
import { prisma } from "@/app/lib/db";
import { planBpmn, type Attachment } from "./planBpmn";
import { sniff } from "./attachmentFromFile";
import { layoutBpmnPlan } from "./layoutBpmnPlan";
import { loadAiRulesForType } from "./loadAiRules";
import { describeAiError } from "./aiErrors";
import { enterAiContext, recordDiagramGenerated, type AiContext } from "./aiTelemetry";
import { enterUserAiKey } from "./aiKeyContext";
import { gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import { decidePromptLink, mergeGeneratedDiagram, nextAiGeneration, type PlanJson } from "./applyGeneration";
import { markPromptUsedDb, runPromptLinkDb } from "./promptLinkDb";
import { deriveDiagramDenorm } from "@/app/lib/diagram/denorm";
import { ensureCurrentInHistory, snapshotDiagramHistory } from "@/app/lib/diagram/diagramHistory";
import { stripPromptAnnotationConnectors, stripPromptAnnotations } from "./promptAnnotation";
import type { AiApplyMeta, DiagramData } from "@/app/lib/diagram/types";

/**
 * A run not heard from for this long is presumed dead (lost to a restart). A
 * live run beats every minute, so a slow model call — the client allows one up
 * to 15 minutes — is never mistaken for a lost one (the 2026-09-28 review).
 */
export const STALE_GENERATE_JOB_MS = 10 * 60 * 1000;
/** How often a live run says it is still alive. */
export const GENERATE_JOB_HEARTBEAT_MS = 60 * 1000;
/** Far beyond any spoken description; a guard against a pasted book. */
export const MAX_GENERATE_PROMPT_CHARS = 50_000;
/** Finished runs are kept this long — long enough to explain one, then gone. */
export const KEEP_FINISHED_GENERATE_JOBS_MS = 7 * 24 * 60 * 60 * 1000;

export type GenerateJobStage = "queued" | "planning" | "shaping" | "saving" | "done";
export type GenerateJobErrorCode =
  | "ai_failed" | "plan_invalid" | "element_limit" | "diagram_gone" | "has_content" | "save_conflict"
  | "server_error" | "worker_lost" | "image_gone" | "image_too_large" | "changed_meanwhile";

/** The model's limit for one image, measured AFTER base64 encoding. The
 *  documented figure has been 5 MB on the API (10 MB in the claude.ai app);
 *  the conservative one is used. A phone photo is ~1–2 MB. */
export const MAX_ENCODED_IMAGE_BYTES = 5 * 1024 * 1024;

/** How long an unused phone photo is kept before the sweep deletes it. */
export const KEEP_UNUSED_PHOTOS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Does the diagram have content — anything besides a prompt note? Generate on
 * the phone fills an EMPTY diagram, and never replaces content unseen.
 */
export function hasDiagramContent(data: unknown): boolean {
  const d = (data ?? {}) as Partial<DiagramData>;
  return stripPromptAnnotations(d.elements ?? []).length > 0
    || stripPromptAnnotationConnectors(d.connectors ?? []).length > 0;
}

/** How the phone described the prompt — the parts of AiApplyMeta the job cannot know itself. */
export type GenerateJobPromptMeta = Pick<
  AiApplyMeta,
  | "selectedPromptId" | "selectedPromptName" | "selectedPromptUnchanged" | "promptSource" | "promptRefined"
  | "promptFromImage" | "promptFromDocument" | "freeForm" | "sourceImage"
>;

export interface GenerateJobInput {
  jobId: string;
  diagramId: string;
  /** The signed-in user: usage, telemetry, the history row. */
  userId: string;
  /** Whose prompts these are — the effective user, as /api/prompts scopes them. */
  promptOwnerId: string;
  orgId: string;
  /** Resolved in the request (it reads cookies); entered in the worker's own frame. */
  aiContext: AiContext;
  /** The caller's own AI key for this model's provider, if they set one up. */
  ownKey: { provider: string; apiKey: string; baseUrl?: string } | null;
  model: string;
  apiKey: string;
  prompt: string;
  promptMeta: GenerateJobPromptMeta;
  /** The diagram's version when the run was asked for (the phone's copy). */
  baseVersion: number;
  /** The diagram's own organisation — where its kept photo lives. */
  diagramOrgId?: string;
  /** A photographed whiteboard to read (AiSourceImage.id; stage 2). */
  sourceImageId?: string;
  /**
   * Replace the diagram's content — the phone's re-generate with a correction
   * (stage 3), asked for explicitly. Saved only if the diagram is STILL the
   * version the phone held: any change since, even a comment, and nothing is
   * replaced. Without it a run only ever fills an empty diagram.
   */
  replace?: boolean;
}

/**
 * Is this run still ours to finish? If the reaper has given up on it (it
 * presumed a restart), it must neither charge nor save — a retry may already be
 * running beside it. Moves the stage on, and counts as a heartbeat.
 */
async function stillRunning(jobId: string, stage?: GenerateJobStage): Promise<boolean> {
  const r = await prisma.diagramGenerateJob.updateMany({
    where: { id: jobId, status: "running" },
    data: { ...(stage ? { stage } : {}), updatedAt: new Date() },
  });
  return r.count === 1;
}

/** Fail with a CURATED message: the phone shows it as-is on its next poll. */
async function fail(jobId: string, code: GenerateJobErrorCode, message: string): Promise<void> {
  try {
    await prisma.diagramGenerateJob.update({
      where: { id: jobId },
      data: { status: "failed", finishedAt: new Date(), errorCode: code, errorMessage: message },
    });
  } catch (e) {
    console.error(`[generate-job] ${jobId} could not be marked failed:`, e instanceof Error ? e.message : e);
  }
}

/** The user-facing text of a refusal from one of the subscription gates. */
async function refusalText(res: Response, fallback: string): Promise<string> {
  try {
    const j = await res.json();
    return typeof j?.error === "string" && j.error.trim() ? j.error : fallback;
  } catch { return fallback; }
}

/**
 * Link the prompt and write the generated diagram over the stored one, with the
 * same version check PUT uses. The prompt is linked ONCE; a save that loses a
 * race (the diagram changed meanwhile — the desktop open on it) re-reads and
 * merges again, up to three times. Returns the new version, or why not.
 */
async function saveGenerated(
  input: GenerateJobInput,
  generated: DiagramData,
  plan: PlanJson,
): Promise<{ version: number } | { failed: "diagram_gone" | "has_content" | "changed_meanwhile" | "save_conflict" }> {
  const { diagramId } = input;
  const owner = { userId: input.promptOwnerId, orgId: input.orgId };
  const meta: AiApplyMeta = { ...input.promptMeta, promptText: input.prompt, model: input.model, planJson: plan };
  const read = () => prisma.diagram.findUnique({ where: { id: diagramId }, select: { name: true, type: true, data: true, version: true } });

  // A save made elsewhere during the run (the desktop open on the empty
  // diagram) is fine while the diagram is still empty — a moved view, say — but
  // content that arrived meanwhile is never replaced unseen. A replace asked
  // for what the phone showed: any save since, and it is not what they saw.
  const changedUnderUs = (c: { version: number; data: unknown }) =>
    c.version !== input.baseVersion && (input.replace || hasDiagramContent(c.data));
  const changedFailure = input.replace ? "changed_meanwhile" as const : "has_content" as const;

  let cur = await read();
  if (!cur) return { failed: "diagram_gone" };
  if (changedUnderUs(cur)) return { failed: changedFailure };
  // What is about to be replaced can be restored from the version history.
  if (input.replace && hasDiagramContent(cur.data)) {
    try { await ensureCurrentInHistory(diagramId, input.userId); }
    catch (e) {
      console.error(`[generate-job] ${input.jobId} could not keep the previous version:`, e instanceof Error ? e.message : e);
      return { failed: "save_conflict" };
    }
  }
  const first = (cur.data ?? {}) as unknown as DiagramData;
  const linked = await runPromptLinkDb(
    decidePromptLink({ meta, prev: first.aiGeneration, diagramName: cur.name, diagramType: cur.type }),
    owner,
  );
  const generatedAt = new Date().toISOString();

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      cur = await read();
      if (!cur) return { failed: "diagram_gone" };
      if (changedUnderUs(cur)) return { failed: changedFailure };
    }
    const current = (cur.data ?? {}) as unknown as DiagramData;
    const aiGeneration = nextAiGeneration({ prev: current.aiGeneration, linked, meta, generatedAt });
    const merged = mergeGeneratedDiagram({ current, generated, aiGeneration, meta });
    // Written exactly as PUT /api/diagrams/[id] writes a data save.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const writeFields: any = { data: merged as unknown, ...(deriveDiagramDenorm(merged) as unknown as object) };
    const cas = await prisma.diagram.updateMany({
      where: { id: diagramId, version: cur.version },
      data: { ...writeFields, version: { increment: 1 } },
    });
    if (cas.count === 1) {
      // Saved. What follows is bookkeeping: it must not turn a saved diagram
      // into a "failed" run.
      try { await snapshotDiagramHistory(diagramId, input.userId); }
      catch (e) { console.error(`[generate-job] ${input.jobId} history snapshot failed:`, e instanceof Error ? e.message : e); }
      if (linked) await markPromptUsedDb(linked.id, input.model, owner);
      return { version: cur.version + 1 };
    }
  }
  return { failed: "save_conflict" };
}

/**
 * Run one generate job to the end. Never throws: every path marks the job
 * succeeded or failed.
 */
export async function runGenerateJob(input: GenerateJobInput): Promise<void> {
  // enterWith binds THIS frame, so it must be the first thing the worker does —
  // the AI call below is recorded against this user, org and invocation point,
  // and a user's own key (any provider) is what that call is billed to.
  enterAiContext(input.aiContext);
  enterUserAiKey(input.ownKey ? { ...input.ownKey, userId: input.userId } : null);
  const { jobId } = input;
  // "Still alive", every minute, until the run ends — see STALE_GENERATE_JOB_MS.
  const beat = setInterval(() => {
    void prisma.diagramGenerateJob.updateMany({ where: { id: jobId, status: "running" }, data: { updatedAt: new Date() } })
      .catch(() => { /* the next beat, or the reaper, settles it */ });
  }, GENERATE_JOB_HEARTBEAT_MS);
  (beat as { unref?: () => void }).unref?.();
  try {
    await prisma.diagramGenerateJob.update({
      where: { id: jobId },
      data: { status: "running", stage: "planning", startedAt: new Date(), model: input.model },
    });
    const stored = await prisma.diagram.findUnique({ where: { id: input.diagramId }, select: { data: true } });
    if (!stored) return fail(jobId, "diagram_gone", "This diagram was deleted before it could be generated.");
    const pcfNodeId = ((stored.data ?? {}) as unknown as DiagramData).pcf?.nodeId;
    const rules = await loadAiRulesForType("bpmn", pcfNodeId);

    // A photographed whiteboard: its bytes, as the model takes an image. The
    // prompt the phone wrote says it is a photo, and that its words correct it
    // (planBpmn's whiteboard reading). Free Form off: laid out normally.
    let attachment: Attachment | undefined;
    if (input.sourceImageId) {
      const img = await prisma.aiSourceImage.findFirst({
        where: { id: input.sourceImageId, ...(input.diagramOrgId ? { orgId: input.diagramOrgId } : {}) },
        select: { bytes: true, name: true },
      });
      if (!img) return fail(jobId, "image_gone", "The photo could not be found. Take it again, then generate.");
      const bytes = Buffer.from(img.bytes);
      const kind = sniff(bytes);
      const mediaType = kind === "jpeg" ? "image/jpeg" : kind === "png" ? "image/png" : kind === "webp" ? "image/webp" : kind === "gif" ? "image/gif" : null;
      if (!mediaType) return fail(jobId, "image_gone", "The photo could not be read. Take it again, then generate.");
      if (Math.ceil(bytes.length / 3) * 4 > MAX_ENCODED_IMAGE_BYTES) {
        return fail(jobId, "image_too_large", "The photo is too large for the AI to read. Take it again, then generate.");
      }
      attachment = { type: "image", data: bytes.toString("base64"), mediaType, name: img.name };
    }

    // Phase 1 — the plan (POST /api/ai/bpmn/plan's steps).
    let plan: PlanJson;
    try {
      const res = await planBpmn({ apiKey: input.apiKey, prompt: input.prompt, rules, model: input.model, ...(attachment ? { attachment } : {}) });
      if (!res.ok) return fail(jobId, "ai_failed", `AI planning failed: ${describeAiError(res.error)}`);
      plan = res.plan;
    } catch (err) {
      console.error(`[generate-job] ${jobId} plan error:`, err instanceof Error ? err.message : err);
      return fail(jobId, "ai_failed", `AI planning failed: ${describeAiError(err)}`);
    }
    // The element cap BEFORE the attempt is counted, as the plan route does:
    // a plan over the tier's limit must not also cost the user an attempt.
    const tooBig = await gateElementCount(input.userId, "bpmn", { elements: plan.elements });
    if (tooBig) {
      return fail(jobId, "element_limit", await refusalText(tooBig, "The process is larger than your plan allows."));
    }
    if (!(await stillRunning(jobId, "shaping"))) return;
    await recordUsage(input.userId, "aiAttempts");

    // Phase 2 — the layout (apply-layout's steps). Labelled as the consoles
    // label it: the saved prompt's name, else the start of the prompt.
    const promptLabel = input.promptMeta.selectedPromptName?.trim() || input.prompt.trim().slice(0, 100) || undefined;
    const laid = layoutBpmnPlan(plan, { promptLabel });
    if (!laid.ok) {
      return fail(jobId, "plan_invalid", "The AI's answer could not be drawn. Try again — rewording the prompt can help.");
    }

    if (!(await stillRunning(jobId, "saving"))) return;
    const saved = await saveGenerated(input, laid.diagramData, plan);
    if ("failed" in saved) {
      if (saved.failed === "diagram_gone") return fail(jobId, "diagram_gone", "This diagram was deleted before it could be saved.");
      if (saved.failed === "has_content") {
        return fail(jobId, "has_content", "The diagram was changed on another device while this was being generated, so the generated one was not saved.");
      }
      if (saved.failed === "changed_meanwhile") {
        return fail(jobId, "changed_meanwhile", "The diagram was changed while this was being generated, so nothing was replaced.");
      }
      return fail(jobId, "save_conflict", "The diagram kept changing on another device, so the generated one was not saved. Try again.");
    }
    await recordDiagramGenerated({ userId: input.userId, orgId: input.orgId, diagramType: "bpmn", source: "mobile-generate" });
    await prisma.diagramGenerateJob.updateMany({
      where: { id: jobId, status: "running" },
      data: { status: "succeeded", stage: "done", finishedAt: new Date(), version: saved.version },
    });
  } catch (err) {
    console.error(`[generate-job] ${jobId} failed:`, err);
    await fail(jobId, "server_error", "Something went wrong while generating. Try again in a moment.");
  } finally {
    clearInterval(beat);
  }
}

/**
 * Turn abandoned runs into honest failures, and drop finished ones after a
 * week. Called lazily from the routes — the only people who care are the ones
 * already asking. Never throws.
 */
export async function reapStaleGenerateJobs(now: number = Date.now()): Promise<void> {
  try {
    const cutoff = new Date(now - STALE_GENERATE_JOB_MS);
    await prisma.diagramGenerateJob.updateMany({
      where: {
        OR: [
          // Not heard from since the cutoff: a live run beats every minute.
          { status: "running", updatedAt: { lt: cutoff } },
          { status: "queued", createdAt: { lt: cutoff } },
        ],
      },
      data: {
        status: "failed", finishedAt: new Date(now), errorCode: "worker_lost",
        errorMessage: "This generation was interrupted before it finished. Tap Generate to try again.",
      },
    });
    await prisma.diagramGenerateJob.deleteMany({
      where: { finishedAt: { lt: new Date(now - KEEP_FINISHED_GENERATE_JOBS_MS) } },
    });
    await sweepUnusedPhonePhotos(now);
  } catch (e) {
    console.error("[generate-job] reap failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Delete phone whiteboard photos nothing uses (the 2026-09-28 review): kept
 * before the run starts, a photo whose run was refused or failed and was never
 * tried again — or that was retaken — would otherwise stay for good, and a
 * whiteboard shot can show people and meeting notes. Only the phone's own
 * photos (named "Whiteboard photo …" by photoShrink.photoName), only after a
 * week, and never one a diagram, a saved version of one, or a live run names.
 */
export async function sweepUnusedPhonePhotos(now: number = Date.now()): Promise<number> {
  const cutoff = new Date(now - KEEP_UNUSED_PHOTOS_MS);
  return prisma.$executeRaw`
    DELETE FROM "AiSourceImage" a
     WHERE a.name LIKE 'Whiteboard photo %'
       AND a."createdAt" < ${cutoff}
       AND NOT EXISTS (SELECT 1 FROM "Diagram" d WHERE d.data -> 'aiGeneration' -> 'sourceImage' ->> 'id' = a.id)
       AND NOT EXISTS (SELECT 1 FROM "DiagramHistory" h WHERE h.snapshot -> 'data' -> 'aiGeneration' -> 'sourceImage' ->> 'id' = a.id)
       AND NOT EXISTS (SELECT 1 FROM "DiagramGenerateJob" j WHERE j."sourceImageId" = a.id AND j.status IN ('queued', 'running'))`;
}

/** A job as the phone sees it on a poll. */
export interface GenerateJobView {
  jobId: string;
  status: string;
  stage: string;
  elapsedMs: number | null;
  /** ISO; when it succeeded or failed. */
  finishedAt: string | null;
  version: number | null;
  /** The photo it was generated from, if any — a failed run is tried again with it. */
  sourceImageId: string | null;
  promptText: string;
  error: { code: string; message: string } | null;
}

export function viewGenerateJob(job: {
  id: string; status: string; stage: string; promptText: string; version: number | null;
  errorCode: string | null; errorMessage: string | null; startedAt: Date | null; finishedAt: Date | null;
  sourceImageId?: string | null;
}, now: number = Date.now()): GenerateJobView {
  return {
    jobId: job.id,
    status: job.status,
    stage: job.stage,
    elapsedMs: job.startedAt ? (job.finishedAt?.getTime() ?? now) - job.startedAt.getTime() : null,
    finishedAt: job.finishedAt ? job.finishedAt.toISOString() : null,
    sourceImageId: job.sourceImageId ?? null,
    version: job.version,
    promptText: job.promptText,
    error: job.status === "failed"
      ? { code: job.errorCode ?? "server_error", message: job.errorMessage ?? "Generation failed." }
      : null,
  };
}
