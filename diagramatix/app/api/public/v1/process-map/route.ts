/**
 * POST /api/public/v1/process-map
 *
 * A description and/or a document in; 202 and a job id out. The caller polls
 * `GET /process-map/{id}`.
 *
 * Async because a generation is 30–120 s and a synchronous call would sit at the
 * mercy of whatever a proxy decides is too long — Azure App Service cuts idle
 * connections at about 230 s, and a slow model on a large SOP can approach that.
 * A partner integration should not be one timeout away from looking broken.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { authenticatePartner, touchKey } from "@/app/lib/partner/auth";
import { withPartnerLogging } from "@/app/lib/partner/logging";
import { partnerError, partnerServerError } from "@/app/lib/partner/errors";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";
import { attachmentFromFile } from "@/app/lib/ai/attachmentFromFile";
import { createJob, redactRequest, reapStaleJobs, purgeExpiredCaptures, jobsToday } from "@/app/lib/partner/jobs";
import { runJob } from "@/app/lib/partner/worker";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";
import { publicBaseUrl } from "@/app/lib/partner/publicUrl";
import { recordAudit } from "@/app/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Decoded, so a 10 MB document is 10 MB and not 13.4 MB of base64. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_BODY_CHARS = 20 * 1024 * 1024;
const MAX_DESCRIPTION_CHARS = 100_000;

interface Body {
  name?: unknown;
  description?: unknown;
  document?: { filename?: unknown; mediaType?: unknown; data?: unknown } | null;
  volumetrics?: unknown;
  options?: { projectId?: unknown; projectName?: unknown } | null;
  /** Rejected on purpose — see below. */
  orgId?: unknown;
  model?: unknown;
  userId?: unknown;
}

export const POST = withPartnerLogging(async (req, ref) => {
  const auth = await authenticatePartner(req, SCOPE_PROCESS_MAPPING, ref);
  if (!auth.ok) return { response: auth.response, errorCode: auth.code };
  const c = auth.caller;
  const tag = { apiKeyId: c.apiKeyId, keyPrefix: c.keyPrefix, capturing: c.capturing };
  const err = (code: Parameters<typeof partnerError>[0], msg: string, headers?: Record<string, string>) =>
    ({ response: partnerError(code, msg, { ref, headers }), errorCode: code, ...tag });

  try {
    // Housekeeping on the way past: cheap, and the only people who care are the
    // ones already asking.
    void reapStaleJobs().catch(() => {});
    void purgeExpiredCaptures().catch(() => {});

    const rl = rateLimit(`partner:post:${c.apiKeyId}`, c.rateLimitPerMin, 60_000);
    if (!rl.ok) return err("rate_limited", "Too many requests. Slow down and try again.", { "Retry-After": String(rl.retryAfterSec) });

    const raw = await req.text();
    if (raw.length > MAX_BODY_CHARS) {
      return err("payload_too_large", `That request is too large. The document limit is ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`);
    }
    let body: Body;
    try { body = JSON.parse(raw) as Body; } catch { return err("bad_request", "That request body is not valid JSON."); }

    // Rejected LOUDLY rather than ignored. A partner who thinks they are choosing
    // the org or the model should be told they are not, and the model in
    // particular would otherwise let them spend our money on a bigger one.
    for (const forbidden of ["orgId", "model", "userId"] as const) {
      if (body[forbidden] !== undefined) {
        return err("bad_request", `"${forbidden}" is not accepted — it is determined by your key.`);
      }
    }

    const description = typeof body.description === "string" ? body.description.trim() : "";
    if (description.length > MAX_DESCRIPTION_CHARS) {
      return err("payload_too_large", "That description is too long.");
    }
    const name = typeof body.name === "string" ? body.name.trim() : "";

    // The document. One only: planBpmn builds a single attachment, and silently
    // dropping a second would be worse than saying so.
    let attachment: Awaited<ReturnType<typeof attachmentFromFile>> | null = null;
    let docBuf: Buffer | null = null;
    if (body.document && typeof body.document === "object") {
      const data = body.document.data;
      if (typeof data !== "string" || !data) return err("bad_request", "The document needs base64 content in `data`.");
      try { docBuf = Buffer.from(data, "base64"); } catch { return err("bad_request", "The document content is not valid base64."); }
      if (docBuf.length > MAX_DOCUMENT_BYTES) {
        return err("payload_too_large", `That document is larger than the ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit.`);
      }
      attachment = await attachmentFromFile(
        docBuf,
        typeof body.document.mediaType === "string" ? body.document.mediaType : undefined,
        typeof body.document.filename === "string" ? body.document.filename : undefined,
      );
      if (!attachment.ok) {
        return err(attachment.reason === "empty" ? "bad_request" : "unsupported_media_type", attachment.message);
      }
    }

    if (!description && !attachment) {
      return err("missing_input", "Supply a description, a document, or both.");
    }

    // The durable half of the quota. The in-memory limiter above resets on
    // deploy; this does not.
    const today = await jobsToday(c.apiKeyId);
    if (today >= c.dailyJobLimit) {
      return err("quota_exceeded", `This key has reached its daily limit of ${c.dailyJobLimit} process maps.`);
    }

    const idempotencyKey = req.headers.get("idempotency-key")?.trim() || null;
    if (idempotencyKey) {
      const existing = await prisma.partnerJob.findFirst({
        where: { apiKeyId: c.apiKeyId, idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        // A retry after a dropped connection must not start a second run.
        return {
          response: NextResponse.json(
            { jobId: existing.id, status: "queued", statusUrl: `/api/public/v1/process-map/${existing.id}`, pollAfterSeconds: 5, ref, duplicate: true },
            { status: 202 },
          ),
          ...tag,
          jobId: existing.id,
        };
      }
    }

    const docMeta = docBuf
      ? { name: typeof body.document?.filename === "string" ? body.document.filename : undefined,
          mediaType: attachment && attachment.ok ? attachment.detected : undefined,
          buf: docBuf }
      : null;

    const jobId = await createJob({
      apiKeyId: c.apiKeyId,
      orgId: c.orgId,
      userId: c.userId,
      idempotencyKey,
      // Set only by our own harness proxy; a partner cannot forge a link to a
      // case because the header is meaningless without a HarnessCase row.
      harnessCaseId: req.headers.get("x-harness-case")?.trim() || null,
      request: redactRequest({ description, name, document: docMeta, volumetrics: body.volumetrics }),
      // The document is retained only during a testing window. Outside one we
      // keep its size and hash and nothing else.
      document: c.capturing ? docMeta : null,
    });

    void touchKey(c.apiKeyId, clientIp(req.headers));

    // Audited with the SHAPE of the request, never its content — enough to
    // answer "what did they send us on Tuesday" without keeping what they sent.
    void recordAudit({
      actorUserId: null, actorEmail: null, effectiveUserId: c.userId, orgId: c.orgId,
      action: "partner.job.created", targetType: "partnerJob", targetId: jobId,
      meta: {
        keyPrefix: c.keyPrefix, phase: c.phase,
        descriptionChars: description.length,
        hasDocument: !!docMeta,
        documentBytes: docMeta ? docMeta.buf.length : 0,
        mediaType: docMeta?.mediaType ?? null,
      },
      ip: clientIp(req.headers),
    }).catch(() => {});

    // Deliberately NOT awaited: the caller gets its 202 now. Every path inside
    // ends in succeedJob or failJob, so a rejection cannot escape.
    // The link goes to a partner and on to their customer, so it must be the
    // address a browser can reach — not the one we bind to.
    const origin = publicBaseUrl(req);
    void runJob({
      jobId, caller: c,
      description: description || undefined,
      attachment: attachment && attachment.ok ? attachment.attachment : undefined,
      name: name || undefined,
      projectId: typeof body.options?.projectId === "string" ? body.options.projectId : null,
      projectName: typeof body.options?.projectName === "string" ? body.options.projectName : undefined,
      volumetrics: (body.volumetrics ?? undefined) as never,
      baseUrl: origin,
    }).catch((e) => console.error(`[partner] job ${jobId} escaped:`, e));

    return {
      response: NextResponse.json(
        { jobId, status: "queued", statusUrl: `/api/public/v1/process-map/${jobId}`, pollAfterSeconds: 5, ref },
        { status: 202 },
      ),
      ...tag,
      jobId,
    };
  } catch (e) {
    return { response: partnerServerError(e, "POST /api/public/v1/process-map", ref), errorCode: "server_error", ...tag };
  }
});
