/**
 * Partner API — the job lifecycle.
 *
 * There is no queue: the worker runs in the POST's own process. That is a
 * deliberate trade for one endpoint, and these tests pin the honest costs of it
 * rather than letting them be discovered in production:
 *
 *  - T2985 the reaper turns an abandoned job into an honest failure, because a
 *    caller polling forever is worse than an error.
 *  - T2986 a stored error is CURATED — a raw Prisma or LibreOffice string would
 *    be handed to the partner on their next poll.
 *  - T2987 the request record is a fingerprint, never the content.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, pgPool } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, addOrgMember } from "../_setup/factories";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import {
  createJob, redactRequest, startJob, advanceJob, succeedJob, failJob,
  reapStaleJobs, purgeExpiredCaptures, jobsToday, STALE_JOB_MS,
} from "@/app/lib/partner/jobs";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";

async function setup(phase = "live", captureUntil: Date | null = null) {
  const user = await createUser();
  const org = await createOrg();
  await addOrgMember(user.id, org.id, "ProcessOwner");
  const { hash, prefix } = mintIngestKey();
  const key = await prisma.apiKey.create({
    data: { name: "k", keyHash: hash, keyPrefix: prefix, orgId: org.id, serviceUserId: user.id, phase, captureUntil },
    select: { id: true },
  });
  await pgPool.query(`UPDATE "ApiKey" SET "scopes" = $1::jsonb WHERE "id" = $2`,
    [JSON.stringify([SCOPE_PROCESS_MAPPING]), key.id]);
  return { user, org, keyId: key.id };
}

const DOC = Buffer.from("A confidential customer process document");

describe("Partner API — jobs", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T2982 — a job runs queued → running → succeeded, carrying its result", async () => {
    const { user, org, keyId } = await setup();
    const id = await createJob({
      apiKeyId: keyId, orgId: org.id, userId: user.id,
      request: redactRequest({ description: "hello" }),
    });

    let row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("queued");

    await startJob(id);
    await advanceJob(id, "planning");
    row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("running");
    expect(row.stage).toBe("planning");
    expect(row.attempts).toBe(1);

    await succeedJob(id, { result: { activities: [{ no: 1, name: "Do It" }] }, projectId: "p1", diagramId: "d1", model: "m" });
    row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("succeeded");
    expect(row.stage).toBe("done");
    expect((row.result as { activities: unknown[] }).activities).toHaveLength(1);
    expect(row.finishedAt).not.toBeNull();
  });

  it("T2983 — the request record is a FINGERPRINT, never the content", async () => {
    // The description lives on the diagram where the customer can delete it; the
    // job row keeps only enough to recognise it.
    const { user, org, keyId } = await setup();
    const secret = "The CFO approves anything over $50,000";
    const id = await createJob({
      apiKeyId: keyId, orgId: org.id, userId: user.id,
      request: redactRequest({ description: secret, document: { name: "sop.pdf", buf: DOC } }),
    });

    const row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    const req = row.request as Record<string, unknown>;
    expect(req.descriptionChars).toBe(secret.length);
    expect(String(req.descriptionSha256)).toHaveLength(64);
    expect(JSON.stringify(req)).not.toContain("CFO");
    expect(JSON.stringify(req)).not.toContain(DOC.toString());
    expect((req.document as { bytes: number }).bytes).toBe(DOC.length);
  });

  it("T2984 — the document is stored only while the key is capturing", async () => {
    const live = await setup("live");
    const liveJob = await createJob({
      apiKeyId: live.keyId, orgId: live.org.id, userId: live.user.id,
      request: redactRequest({}), document: null, // the route passes null outside a window
    });
    expect((await prisma.partnerJob.findUniqueOrThrow({ where: { id: liveJob } })).inputDocument).toBeNull();

    const testing = await setup("testing", new Date(Date.now() + 86_400_000));
    const testJob = await createJob({
      apiKeyId: testing.keyId, orgId: testing.org.id, userId: testing.user.id,
      request: redactRequest({}), document: { name: "sop.pdf", buf: DOC },
    });
    const stored = await prisma.partnerJob.findUniqueOrThrow({ where: { id: testJob } });
    expect(stored.inputDocument).not.toBeNull();
    expect(Buffer.from(stored.inputDocument!).toString()).toBe(DOC.toString());
  });

  it("T2985 — the reaper turns an abandoned job into an honest failure", async () => {
    // A container swap mid-job leaves a running row nothing will finish. Polling
    // forever is a worse failure than an error.
    const { user, org, keyId } = await setup();
    const id = await createJob({ apiKeyId: keyId, orgId: org.id, userId: user.id, request: redactRequest({}) });
    await prisma.partnerJob.update({
      where: { id },
      data: { status: "running", startedAt: new Date(Date.now() - STALE_JOB_MS - 60_000) },
    });

    expect(await reapStaleJobs()).toBe(1);
    const row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("failed");
    expect((row.error as { code: string }).code).toBe("worker_lost");
    // …and it tells the caller what to do about it.
    expect((row.error as { message: string }).message).toMatch(/again/i);

    // A job that is merely slow is left alone.
    const fresh = await createJob({ apiKeyId: keyId, orgId: org.id, userId: user.id, request: redactRequest({}) });
    await startJob(fresh);
    expect(await reapStaleJobs()).toBe(0);
  });

  it("T2986 — a stored error is curated, never a raw exception string", async () => {
    const { user, org, keyId } = await setup();
    const id = await createJob({ apiKeyId: keyId, orgId: org.id, userId: user.id, request: redactRequest({}) });
    await failJob(id, "ai_plan_failed", "We could not build a process model from what was supplied.");

    const row = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    const e = row.error as { code: string; message: string };
    expect(e.code).toBe("ai_plan_failed");
    // The shapes a leaked internal message takes.
    expect(e.message).not.toMatch(/PrismaClient|at Object\.|\.ts:\d+|Invalid `prisma\./);
  });

  it("T2987 — an expired testing window purges the document it was keeping", async () => {
    // Going live purges immediately; this is the other case — a window that just
    // ran out while nobody was looking. A promise with no enforcement is not one.
    const { user, org, keyId } = await setup("testing", new Date(Date.now() + 86_400_000));
    const id = await createJob({
      apiKeyId: keyId, orgId: org.id, userId: user.id,
      request: redactRequest({}), document: { name: "sop.pdf", buf: DOC },
    });
    expect((await prisma.partnerJob.findUniqueOrThrow({ where: { id } })).inputDocument).not.toBeNull();

    await prisma.apiKey.update({ where: { id: keyId }, data: { captureUntil: new Date(Date.now() - 1000) } });
    expect(await purgeExpiredCaptures()).toBe(1);

    const after = await prisma.partnerJob.findUniqueOrThrow({ where: { id } });
    expect(after.inputDocument).toBeNull();
    expect(after.inputDocumentName).toBeNull();
    // The job itself survives — only the content goes.
    expect(after.id).toBe(id);
  });

  it("T2988 — the daily count is per key and per day", async () => {
    const a = await setup();
    const b = await setup();
    for (let i = 0; i < 3; i++) {
      await createJob({ apiKeyId: a.keyId, orgId: a.org.id, userId: a.user.id, request: redactRequest({}) });
    }
    await createJob({ apiKeyId: b.keyId, orgId: b.org.id, userId: b.user.id, request: redactRequest({}) });

    expect(await jobsToday(a.keyId)).toBe(3);
    expect(await jobsToday(b.keyId)).toBe(1);
  });

  it("T2989 — the same idempotency key cannot make two jobs", async () => {
    // A retry after a dropped connection must not start a second generation.
    const { user, org, keyId } = await setup();
    const args = { apiKeyId: keyId, orgId: org.id, userId: user.id, request: redactRequest({}), idempotencyKey: "abc-123" };
    await createJob(args);
    await expect(createJob(args)).rejects.toThrow();
    expect(await prisma.partnerJob.count({ where: { apiKeyId: keyId } })).toBe(1);
  });
});
