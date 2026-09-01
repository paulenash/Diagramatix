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
import { recordAudit, auditActor } from "@/app/lib/audit";

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

/**
 * Delete traffic rows — one, or everything before a moment.
 *
 * The Usage list is a working surface, not a ledger: it fills with the noise of
 * testing, and being unable to clear that noise is what makes a screen stop being
 * looked at. So a row can go, and so can a whole session's worth.
 *
 * Two deliberate limits. The bulk form takes a CUT-OFF rather than a count or a
 * "clear all", because "everything before I started this afternoon" is the thing
 * anybody actually wants and it cannot be misread. And it reports how many rows
 * it removed, so an accident is visible immediately rather than discovered later
 * as an absence.
 *
 * PartnerJob rows are NOT touched. They carry the generated diagrams and the
 * inputs behind them; a request log is the record of the HTTP call, and clearing
 * that should not quietly destroy the runs it points at.
 */
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as
    | { id?: string; before?: string; keyId?: string | null }
    | null;

  if (body?.id) {
    const row = await prisma.partnerRequest.findUnique({
      where: { id: body.id }, select: { id: true, ref: true, apiKeyId: true },
    });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await prisma.partnerRequest.delete({ where: { id: row.id } });
    await recordAudit({
      ...auditActor(session, req), orgId: null,
      action: "partner.usage.delete", targetType: "partnerRequest", targetId: row.id,
      meta: { ref: row.ref, apiKeyId: row.apiKeyId },
    });
    return NextResponse.json({ ok: true, deleted: 1 });
  }

  if (body?.before) {
    const cutoff = new Date(body.before);
    if (Number.isNaN(cutoff.getTime())) {
      return NextResponse.json({ error: "`before` is not a date" }, { status: 400 });
    }
    const where = {
      at: { lt: cutoff },
      ...(body.keyId ? { apiKeyId: body.keyId } : {}),
    };
    const { count } = await prisma.partnerRequest.deleteMany({ where });
    await recordAudit({
      ...auditActor(session, req), orgId: null,
      action: "partner.usage.bulkDelete", targetType: "partnerRequest", targetId: null,
      meta: { before: cutoff.toISOString(), apiKeyId: body.keyId ?? null, deleted: count },
    });
    return NextResponse.json({ ok: true, deleted: count });
  }

  return NextResponse.json({ error: "Supply an id, or a `before` cut-off" }, { status: 400 });
}
