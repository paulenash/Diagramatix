/**
 * The process-map worker.
 *
 * Runs in the POST request's own process, deliberately NOT awaited, so the
 * caller gets a 202 immediately. There is no queue in this codebase and adding
 * one for a single endpoint would be a poor trade; the honest costs of that
 * choice are handled rather than hidden:
 *
 *  - A container swap mid-job leaves a `running` row nothing will finish. The
 *    reaper turns those into `worker_lost` and the POST is idempotent, so a
 *    caller retries once.
 *  - Nothing here may throw into a dangling promise. Every path ends in either
 *    `succeedJob` or `failJob`, and the catch-all maps to a CURATED message —
 *    a raw error stored on the row would be handed to the partner on their next
 *    poll.
 */
import { prisma } from "@/app/lib/db";
import type { Attachment } from "@/app/lib/ai/planBpmn";
import { resolveGenerateModel } from "@/app/lib/ai/aiModelSetting";
import { aiApiKey } from "@/app/lib/ai/anthropicClient";
import {
  AI_INVOCATION_POINTS, enterAiContext, recordDiagramGenerated,
} from "@/app/lib/ai/aiTelemetry";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import { uniqueDiagramName } from "@/app/lib/valueChain/uniqueDiagramName";
import { runProcessMap, ProcessMapError } from "./runProcessMap";
import { renderDiagramSvg } from "./renderDiagramSvg";
import { svgToPdf } from "@/app/lib/documents/svgToPdf";
import { applyVolumetrics, type Volumetrics } from "@/app/lib/simulation/volumetrics";
import { advanceJob, failJob, startJob, succeedJob } from "./jobs";
import { deliverCallback } from "./callback";
import type { PartnerCaller } from "./auth";

export interface WorkerInput {
  jobId: string;
  caller: PartnerCaller;
  description?: string;
  attachment?: Attachment;
  name?: string;
  /** Where the diagram lands. A fixed project on the key, or one we create. */
  projectId?: string | null;
  projectName?: string;
  /** Effort and frequency, written onto the diagram so it opens runnable. */
  volumetrics?: Volumetrics;
  /** Free text from the caller, appended to the prompt (v2/7). */
  instructions?: string;
  /** Where to POST the finished result, if the caller would rather not poll (v2/5). */
  callbackUrl?: string | null;
  baseUrl: string;
}

/** A partner never picks the model. `chooseModel` would silently fall back on a
 *  disallowed one, which would let a partner drive us onto an expensive model at
 *  our cost — so the choice is not offered at all. */
async function modelForRun(hasImage: boolean): Promise<{ model: string; apiKey: string } | null> {
  const model = await resolveGenerateModel(hasImage);
  const apiKey = aiApiKey(model);
  return apiKey ? { model, apiKey } : null;
}

export async function runJob(input: WorkerInput): Promise<void> {
  const { jobId, caller } = input;

  // enterWith binds THIS frame, so it must be the first thing the worker does —
  // every AI call made downstream inherits it and writes its telemetry row.
  enterAiContext({
    userId: caller.userId,
    orgId: caller.orgId,
    invocationPoint: AI_INVOCATION_POINTS.PartnerProcessMap,
  });

  try {
    await startJob(jobId);

    const picked = await modelForRun(input.attachment?.type === "image");
    if (!picked) {
      await failJob(jobId, "ai_unavailable", "Process mapping is temporarily unavailable. Try again shortly.");
      return;
    }

    // Quota BEFORE the model call, so a doomed request costs no tokens. The
    // subscription message talks about "your plan", which is nonsense to a
    // partner, so it is translated.
    const blocked = await gateLimit(caller.userId, "aiAttempts");
    if (blocked) {
      await failJob(jobId, "quota_exceeded", "This key has reached its allowance for the period.");
      return;
    }

    let plan: unknown = null;
    // Per-stage milliseconds (v2/6). Recorded here because this worker owns the
    // whole run in one process, so no extra column is needed to accumulate them.
    // Returned to the caller so their progress indicator can be built on their
    // own measured history — the only honest basis, since nothing can predict a
    // model's running time in advance.
    const stageMs: Record<string, number> = {};
    let stageAt = Date.now();
    let stageName = "reading";
    const markStage = (next: string) => {
      const now = Date.now();
      stageMs[stageName] = (stageMs[stageName] ?? 0) + (now - stageAt);
      stageAt = now;
      stageName = next;
    };

    const run = await runProcessMap({
      description: input.description,
      attachment: input.attachment,
      name: input.name,
      instructions: input.instructions,
      model: picked.model,
      apiKey: picked.apiKey,
      onStage: (s) => { markStage(s); void advanceJob(jobId, s); },
      onPlan: (p) => { plan = p; },
    });

    // Element cap AFTER the plan, matching the editor's ordering: we know what
    // was produced before we decide whether the tier allows it.
    const tooBig = await gateElementCount(caller.userId, "bpmn", { elements: run.data.elements });
    if (tooBig) {
      await failJob(jobId, "element_limit", "That process produced more elements than this key's plan allows.");
      return;
    }

    // Volumetrics BEFORE saving, so the stored diagram already carries them —
    // a second write would leave a window where the diagram is half-configured.
    const vol = input.volumetrics && (input.volumetrics.minutesPerRun || input.volumetrics.runsPerMonth)
      ? applyVolumetrics(run.data, input.volumetrics)
      : null;
    if (vol) run.data = vol.data;

    await advanceJob(jobId, "saving");

    // The destination. A key may pin a project (the harness does, so its runs
    // pile up in one place); otherwise each run gets its own.
    let projectId = input.projectId ?? caller.projectId ?? null;
    if (projectId) {
      const exists = await prisma.project.findFirst({
        where: { id: projectId, orgId: caller.orgId },
        select: { id: true },
      });
      if (!exists) projectId = null; // never write into another org's project
    }
    if (!projectId) {
      const created = await prisma.project.create({
        data: {
          name: (input.projectName ?? input.name ?? "Process map").trim().slice(0, 120),
          userId: caller.userId,
          orgId: caller.orgId,
          ownerName: caller.keyName,
        },
        select: { id: true },
      });
      projectId = created.id;
    }

    // A name already in the project gets " (2)" rather than overwriting — the
    // same rule the repository generator uses, and the reason it exists is the
    // same: a second run is for comparing against the first.
    const taken = new Set(
      (await prisma.diagram.findMany({ where: { projectId }, select: { name: true } })).map((d) => d.name),
    );
    const diagramName = uniqueDiagramName((input.name ?? "Process map").trim().slice(0, 120), taken);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const data = run.data as any;
    data.aiGeneration = {
      promptText: run.prompt,
      model: picked.model,
      generatedAt: new Date().toISOString(),
      source: "partner-api",
      ...(plan ? { plan } : {}),
      ...(run.diagnostics.length ? { diagnostics: run.diagnostics } : {}),
    };

    const saved = await prisma.diagram.create({
      data: {
        name: diagramName,
        type: "bpmn",
        data: data as any,
        userId: caller.userId,
        diagramOwnerId: caller.userId,
        orgId: caller.orgId,
        projectId,
      },
      select: { id: true },
    });
    /* eslint-enable @typescript-eslint/no-explicit-any */

    await recordUsage(caller.userId, "aiAttempts");
    await recordDiagramGenerated({
      userId: caller.userId, orgId: caller.orgId, diagramType: "bpmn", source: "partner-api",
    });

    // Render now so an artifact GET is a read rather than a LibreOffice spawn.
    //
    // A MISSING PDF MUST NEVER FAIL A SUCCESSFUL PROCESS MAP. There is no
    // soffice in local dev, and a partner who got a good model should not be
    // told the whole thing failed because a renderer was absent — they get the
    // SVG and a null pdfUrl instead.
    let svg: string | null = null;
    let pdf: Buffer | null = null;
    try {
      svg = renderDiagramSvg(run.data);
      pdf = await svgToPdf(svg);
    } catch (e) {
      console.warn(`[partner] job ${jobId}: no PDF (${e instanceof Error ? e.message : String(e)})`);
    }

    await succeedJob(jobId, {
      model: picked.model,
      svg, pdf,
      projectId,
      diagramId: saved.id,
      result: {
        diagram: {
          id: saved.id,
          name: diagramName,
          type: "bpmn",
          projectId,
          deepLink: `${input.baseUrl}/diagram/${saved.id}`,
          elementCount: run.data.elements.length,
          connectorCount: run.data.connectors.length,
        },
        ...run.shape,
        stageMs: (markStage("done"), stageMs),
        ...(vol ? { volumetrics: { ...input.volumetrics, basis: vol.basis, derived: vol.derived, applied: vol.applied, notes: vol.notes } } : {}),
        diagnostics: run.diagnostics.map((d) => ({ kind: d.kind, label: d.label, detail: d.detail })),
      },
    });

    // Push the same body a poll would return (v2/5). Deliberately after the job
    // is already durable: if this never lands, the result is still there to be
    // polled, so a failed hook costs convenience and nothing else.
    if (input.callbackUrl) {
      void deliverCallback(input.callbackUrl, {
        jobId,
        status: "succeeded",
        statusUrl: `${input.baseUrl}/api/public/v1/process-map/${jobId}`,
      }, { jobId, ref: jobId }).catch(() => {});
    }
  } catch (err) {
    if (err instanceof ProcessMapError) {
      await failJob(jobId, err.code, err.message).catch(() => {});
      return;
    }
    // The real cause goes to the log with the job id; the partner gets a message
    // they can act on and nothing about our internals.
    console.error(`[partner] job ${jobId} failed:`, err);
    await failJob(
      jobId,
      "server_error",
      "Something went wrong while building the process model. Quote this job id if you report it.",
    ).catch(() => {});
  }
}
