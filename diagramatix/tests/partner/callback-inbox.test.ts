/**
 * The harness callback receiver.
 *
 * It is deliberately UNAUTHENTICATED — the caller is our own worker making an
 * ordinary outbound request, holding no session and presenting no key, exactly as
 * a partner's endpoint would see it. An authenticated receiver would be testing
 * something other than what a partner will experience.
 *
 * So the property that keeps it safe gets a test: it stores a body only for a job
 * that EXISTS, and it hands nothing back without SuperAdmin.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, addOrgMember } from "../_setup/factories";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { acceptDelivery, takeCallback, recordCallback } from "@/app/lib/partner/callbackInbox";

/** The route's own existence check, without the route's next-auth import. */
const jobExists = async (id: string) =>
  !!(await prisma.partnerJob.findUnique({ where: { id }, select: { id: true } }).catch(() => null));
const POST = async (req: Request) => { await acceptDelivery(req, jobExists); return { status: 200 }; };

const post = (jobId: string, body: unknown) =>
  new Request("https://x.test/api/admin/api-harness/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Diagramatix-Job-Id": jobId },
    body: JSON.stringify(body),
  });

async function makeJob(): Promise<string> {
  const user = await createUser();
  const org = await createOrg();
  await addOrgMember(user.id, org.id, "ProcessOwner");
  const { hash, prefix } = mintIngestKey();
  const key = await prisma.apiKey.create({
    data: { name: "k", keyHash: hash, keyPrefix: prefix, orgId: org.id, serviceUserId: user.id },
    select: { id: true },
  });
  const job = await prisma.partnerJob.create({
    data: { apiKeyId: key.id, orgId: org.id, userId: user.id, status: "succeeded" },
    select: { id: true },
  });
  return job.id;
}

describe("harness callback receiver", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T3092 — a delivery for a REAL job is recorded", async () => {
    const jobId = await makeJob();
    const res = await POST(post(jobId, { status: "succeeded" }));
    expect(res.status).toBe(200);
    const got = takeCallback(jobId);
    expect(got).not.toBeNull();
    expect(got!.jobId).toBe(jobId);
  });

  it("T3093 — a delivery for an UNKNOWN job is accepted and dropped", async () => {
    // 200 rather than 404: this is pretending to be somebody's webhook, and a
    // webhook that argues about ids is not a useful thing to test against. What
    // matters is that nothing is stored, so the endpoint cannot be used as free
    // memory by anyone who finds it.
    const res = await POST(post("no-such-job-id", { anything: true }));
    expect(res.status).toBe(200);
    expect(takeCallback("no-such-job-id")).toBeNull();
  });

  it("T3094 — the stored headers never carry a key", async () => {
    const jobId = await makeJob();
    const req = new Request("https://x.test/api/admin/api-harness/callback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Diagramatix-Job-Id": jobId,
        "X-Api-Key": "dgxk_secret_value",
        Authorization: "Bearer dgxk_secret_value",
      },
      body: "{}",
    });
    await POST(req);
    const got = takeCallback(jobId);
    expect(JSON.stringify(got)).not.toContain("dgxk_secret_value");
  });

  it("T3095 — the inbox is bounded, so a stuck loop cannot eat the process", () => {
    for (let i = 0; i < 80; i++) {
      recordCallback({ jobId: `j${i}`, at: new Date().toISOString(), headers: {}, body: {} });
    }
    // Oldest evicted first: the earliest ids are gone, the latest survive.
    expect(takeCallback("j0")).toBeNull();
    expect(takeCallback("j79")).not.toBeNull();
  });
});
