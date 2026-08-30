/**
 * PartnerJob lifecycle: create, advance, finish — and reap.
 *
 * All Json columns are written with raw SQL through `pgPool`, because Prisma 7
 * omits Json fields from model update inputs. That is the house rule and it is
 * easy to forget, so every write goes through the helpers here rather than being
 * scattered across routes.
 */
import { createHash } from "node:crypto";
import { prisma, pgPool } from "@/app/lib/db";
import type { PartnerErrorCode } from "./errors";

/** Anything still `running` after this is presumed dead. */
export const STALE_JOB_MS = 10 * 60 * 1000;

export type JobStage = "queued" | "reading" | "planning" | "shaping" | "saving" | "done";

/** What we keep about the REQUEST: shape and fingerprint, never content. */
export interface RedactedRequest {
  descriptionChars: number;
  descriptionSha256: string | null;
  document: { name: string | null; mediaType: string | null; bytes: number; sha256: string } | null;
  volumetrics: unknown;
  name: string | null;
}

const sha = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

export function redactRequest(input: {
  description?: string;
  name?: string;
  document?: { name?: string; mediaType?: string; buf: Buffer } | null;
  volumetrics?: unknown;
}): RedactedRequest {
  const d = input.description ?? "";
  return {
    descriptionChars: d.length,
    descriptionSha256: d ? sha(d) : null,
    document: input.document
      ? {
          name: input.document.name ?? null,
          mediaType: input.document.mediaType ?? null,
          bytes: input.document.buf.length,
          sha256: sha(input.document.buf),
        }
      : null,
    volumetrics: input.volumetrics ?? null,
    name: input.name ?? null,
  };
}

/** Write a Json column. Prisma 7 cannot, so everything routes through here. */
async function setJson(id: string, column: "request" | "result" | "error", value: unknown): Promise<void> {
  await pgPool.query(`UPDATE "PartnerJob" SET "${column}" = $1::jsonb, "updatedAt" = now() WHERE "id" = $2`, [
    JSON.stringify(value ?? {}),
    id,
  ]);
}

export async function createJob(opts: {
  apiKeyId: string;
  orgId: string;
  userId: string;
  request: RedactedRequest;
  idempotencyKey?: string | null;
  harnessCaseId?: string | null;
  /** Only while the key is in its testing window. */
  document?: { name?: string; mediaType?: string; buf: Buffer } | null;
}): Promise<string> {
  const job = await prisma.partnerJob.create({
    // Written out rather than spread: a conditional spread makes Prisma pick
    // the checked create input, which then rejects the scalar apiKeyId.
    data: {
      apiKeyId: opts.apiKeyId,
      orgId: opts.orgId,
      userId: opts.userId,
      idempotencyKey: opts.idempotencyKey ?? null,
      harnessCaseId: opts.harnessCaseId ?? null,
      // new Uint8Array(...) at the boundary: Buffer is Buffer<ArrayBufferLike>,
      // which no longer satisfies Prisma’s Uint8Array<ArrayBuffer> under the
      // current TS typed-array generics.
      inputDocument: opts.document ? new Uint8Array(opts.document.buf) : null,
      inputDocumentName: opts.document?.name ?? null,
      inputDocumentType: opts.document?.mediaType ?? null,
    },
    select: { id: true },
  });
  await setJson(job.id, "request", opts.request);
  return job.id;
}

export async function startJob(id: string): Promise<void> {
  await prisma.partnerJob.update({
    where: { id },
    data: { status: "running", stage: "reading", startedAt: new Date(), attempts: { increment: 1 } },
  });
}

export async function advanceJob(id: string, stage: JobStage): Promise<void> {
  try {
    await prisma.partnerJob.update({ where: { id }, data: { stage } });
  } catch { /* a progress breadcrumb must never fail the work */ }
}

export async function succeedJob(id: string, opts: {
  result: unknown;
  projectId: string;
  diagramId: string;
  model: string;
}): Promise<void> {
  await setJson(id, "result", opts.result);
  await prisma.partnerJob.update({
    where: { id },
    data: {
      status: "succeeded", stage: "done", finishedAt: new Date(),
      projectId: opts.projectId, diagramId: opts.diagramId, model: opts.model,
    },
  });
}

/**
 * Fail a job with a CURATED message.
 *
 * The signature takes a code and a message rather than an Error precisely so a
 * raw `err.message` cannot end up here — this value is handed back to the
 * partner on their next poll, and a Prisma or LibreOffice string is both a leak
 * and useless to them.
 */
export async function failJob(id: string, code: PartnerErrorCode | "worker_lost", message: string): Promise<void> {
  await setJson(id, "error", { code, message });
  await prisma.partnerJob.update({
    where: { id },
    data: { status: "failed", finishedAt: new Date() },
  });
}

/**
 * Turn abandoned jobs into honest failures.
 *
 * The worker runs in the request's own process, so an Azure container swap
 * mid-job leaves a `running` row nothing will ever finish. Without this the
 * caller polls forever, which is a worse failure than an error. Called lazily at
 * the top of POST and GET rather than on a cron: it is a cheap UPDATE, and the
 * only people who care are the ones already asking.
 */
export async function reapStaleJobs(): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_JOB_MS);
  const stale = await prisma.partnerJob.findMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    select: { id: true },
    take: 50,
  });
  for (const j of stale) {
    await failJob(
      j.id,
      "worker_lost",
      "This run was interrupted before it finished. Submit it again — the same request will produce a new job.",
    );
  }
  return stale.length;
}

/**
 * Purge captured content whose window has closed.
 *
 * Runs on the same lazy sweep. Going live purges immediately (see the key
 * route); this catches the other case — a testing window that simply expired
 * while nobody was looking. A promise with no enforcement is not a promise.
 */
export async function purgeExpiredCaptures(): Promise<number> {
  const expired = await prisma.apiKey.findMany({
    where: {
      OR: [
        { phase: "testing", captureUntil: { lt: new Date() } },
        { phase: { not: "testing" } },
      ],
    },
    select: { id: true },
  });
  if (expired.length === 0) return 0;
  const ids = expired.map((k) => k.id);
  const jobs = await prisma.partnerJob.updateMany({
    where: { apiKeyId: { in: ids }, NOT: { inputDocument: null } },
    data: { inputDocument: null, inputDocumentName: null, inputDocumentType: null },
  });
  await prisma.partnerRequest.updateMany({
    where: { apiKeyId: { in: ids }, NOT: { requestBody: null } },
    data: { requestBody: null, responseBody: null, requestHeaders: null },
  });
  return jobs.count;
}

/** How many jobs this key has started today — the durable half of the quota.
 *  The in-memory rate limiter resets on deploy; this does not. */
export async function jobsToday(apiKeyId: string): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  return prisma.partnerJob.count({ where: { apiKeyId, createdAt: { gte: since } } });
}
