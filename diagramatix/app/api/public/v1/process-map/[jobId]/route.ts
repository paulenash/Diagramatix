/**
 * GET /api/public/v1/process-map/{jobId} — poll.
 *
 * A job belonging to another key is a **404, not a 403**. A 403 would confirm
 * the id exists, which turns this endpoint into an oracle for enumerating other
 * partners' jobs. "Not found" is both safer and true from the caller's point of
 * view: there is no such job *of theirs*.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { authenticatePartner } from "@/app/lib/partner/auth";
import { withPartnerLogging } from "@/app/lib/partner/logging";
import { partnerError, partnerServerError } from "@/app/lib/partner/errors";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";
import { reapStaleJobs } from "@/app/lib/partner/jobs";
import { rateLimit } from "@/app/lib/rateLimit";

export const dynamic = "force-dynamic";

export const GET = withPartnerLogging(async (req, ref) => {
  const auth = await authenticatePartner(req, SCOPE_PROCESS_MAPPING, ref);
  if (!auth.ok) return { response: auth.response, errorCode: auth.code };
  const c = auth.caller;
  const tag = { apiKeyId: c.apiKeyId, keyPrefix: c.keyPrefix, capturing: c.capturing };

  // The id comes off the path rather than through a params argument, because the
  // logging wrapper hands the handler a plain Request.
  const jobId = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";

  try {
    // A caller polling is exactly who should pay for the sweep — it is the
    // moment a stuck job of theirs would otherwise hang forever.
    void reapStaleJobs().catch(() => {});

    const rl = rateLimit(`partner:poll:${jobId}`, 30, 60_000);
    if (!rl.ok) {
      return {
        response: partnerError("rate_limited", "Polling too fast. Wait a few seconds between checks.", {
          ref, headers: { "Retry-After": String(rl.retryAfterSec) },
        }),
        errorCode: "rate_limited", ...tag,
      };
    }

    const job = await prisma.partnerJob.findFirst({
      // Scoped to the caller's own key. Not found, rather than forbidden.
      where: { id: jobId, apiKeyId: c.apiKeyId },
    });
    if (!job) {
      return { response: partnerError("not_found", "No such job.", { ref }), errorCode: "not_found", ...tag };
    }

    const base = {
      jobId: job.id,
      status: job.status,
      stage: job.stage,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      ref,
    };

    if (job.status === "succeeded") {
      const result = (job.result ?? {}) as Record<string, unknown>;
      return {
        response: NextResponse.json({
          ...base,
          durationMs: job.startedAt && job.finishedAt ? job.finishedAt.getTime() - job.startedAt.getTime() : null,
          model: job.model,
          ...result,
          artifacts: {
            // Rendered in slice 5. Named now so the shape does not change under
            // a caller who has already written code against it.
            pdfUrl: null,
            svgUrl: null,
            bpmnXmlUrl: null,
          },
        }),
        ...tag, jobId: job.id,
      };
    }

    if (job.status === "failed") {
      const e = (job.error ?? {}) as { code?: string; message?: string };
      return {
        response: NextResponse.json({
          ...base,
          error: { code: e.code ?? "server_error", message: e.message ?? "That run did not complete." },
        }),
        ...tag, jobId: job.id, errorCode: e.code,
      };
    }

    return {
      response: NextResponse.json({ ...base, pollAfterSeconds: 5 }),
      ...tag, jobId: job.id,
    };
  } catch (e) {
    return { response: partnerServerError(e, "GET /api/public/v1/process-map/[jobId]", ref), errorCode: "server_error", ...tag };
  }
});
