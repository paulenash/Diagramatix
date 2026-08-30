/**
 * SuperAdmin — Process API traffic.
 *
 * Reads `PartnerRequest` (one row per HTTP call, written at the edge) joined to
 * the job a call created, so the list covers everything: the 401s that never
 * reached a handler as well as the runs that produced a diagram.
 *
 * Bodies come back only when the key's phase kept them. When they were not kept,
 * the response says so explicitly rather than returning null and letting the
 * screen look broken — "we did not keep this" and "something went wrong" must
 * not look the same.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ref = url.searchParams.get("ref")?.trim();
  const keyId = url.searchParams.get("keyId")?.trim();
  const errorsOnly = url.searchParams.get("errors") === "1";
  const detailId = url.searchParams.get("id")?.trim();

  // ── One call, in full ─────────────────────────────────────────────────────
  if (detailId) {
    const row = await prisma.partnerRequest.findUnique({
      where: { id: detailId },
      include: { apiKey: { select: { name: true, phase: true, captureUntil: true } } },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const job = row.jobId
      ? await prisma.partnerJob.findUnique({
          where: { id: row.jobId },
          select: {
            id: true, status: true, stage: true, model: true, attempts: true,
            startedAt: true, finishedAt: true, request: true, result: true, error: true,
            projectId: true, diagramId: true,
            inputDocumentName: true, inputDocumentType: true,
          },
        })
      : null;

    // Cost and tokens for the run, from the telemetry rows the AI client writes
    // at the seam. Matched on the window rather than an id because the seam does
    // not know about jobs.
    const ai = job?.startedAt
      ? await prisma.aiInvocation.findMany({
          where: {
            invocationPoint: "partner.process-map",
            createdAt: { gte: job.startedAt, lte: job.finishedAt ?? new Date() },
          },
          select: { model: true, inputTokens: true, outputTokens: true, latencyMs: true, status: true },
        })
      : [];

    const kept = row.requestBody !== null || row.responseBody !== null;
    return NextResponse.json({
      call: {
        id: row.id, ref: row.ref, at: row.at, method: row.method, path: row.path,
        status: row.status, durationMs: row.durationMs, ip: row.ip, userAgent: row.userAgent,
        requestBytes: row.requestBytes, responseBytes: row.responseBytes, errorCode: row.errorCode,
        keyName: row.apiKey?.name ?? null, keyPrefix: row.keyPrefix, phase: row.apiKey?.phase ?? null,
      },
      // The screen needs to distinguish "kept nothing" from "nothing happened".
      bodies: kept
        ? { requestBody: row.requestBody, responseBody: row.responseBody, requestHeaders: row.requestHeaders }
        : null,
      bodiesReason: kept
        ? null
        : row.apiKey?.phase === "testing"
          ? "The testing window for this key has closed, so the captured content was purged."
          : "This key is not in a testing phase, so request content is never stored — only its size and hash.",
      job,
      ai,
    });
  }

  // ── The list ──────────────────────────────────────────────────────────────
  const where: Record<string, unknown> = {};
  if (ref) where.ref = ref;
  if (keyId) where.apiKeyId = keyId;
  if (errorsOnly) where.status = { gte: 400 };

  const [rows, keys] = await Promise.all([
    prisma.partnerRequest.findMany({
      where, orderBy: { at: "desc" }, take: 200,
      include: { apiKey: { select: { name: true, phase: true } } },
    }),
    prisma.apiKey.findMany({ select: { id: true, name: true, keyPrefix: true, phase: true }, orderBy: { createdAt: "desc" } }),
  ]);

  // Today's headline numbers. Counted over calls, not jobs, so a 401 storm is
  // visible in the error rate rather than hidden behind "no jobs failed".
  const since = new Date(); since.setHours(0, 0, 0, 0);
  const todays = await prisma.partnerRequest.findMany({
    where: { at: { gte: since }, ...(keyId ? { apiKeyId: keyId } : {}) },
    select: { status: true, durationMs: true },
  });
  const durations = todays.map((t) => t.durationMs).sort((a, b) => a - b);
  const pct = (p: number) => (durations.length ? durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] : 0);

  return NextResponse.json({
    keys,
    summary: {
      calls: todays.length,
      errors: todays.filter((t) => t.status >= 400).length,
      p50: pct(0.5),
      p95: pct(0.95),
    },
    calls: rows.map((r) => ({
      id: r.id, ref: r.ref, at: r.at, method: r.method, path: r.path, status: r.status,
      durationMs: r.durationMs, errorCode: r.errorCode, jobId: r.jobId,
      keyName: r.apiKey?.name ?? null, keyPrefix: r.keyPrefix, phase: r.apiKey?.phase ?? null,
    })),
  });
}
