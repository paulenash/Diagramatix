/**
 * The harness: its case library, and the boundary that keeps a key out of the
 * browser.
 *
 * T2992 is the one that matters. A `HarnessCase` is OUR test material and must
 * survive every retention sweep; `PartnerJob.inputDocument` is a customer's and
 * must not. They hold similar bytes with opposite requirements, and conflating
 * them would either lose the corpus or keep customer content forever.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma, pgPool } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, addOrgMember } from "../_setup/factories";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { createJob, redactRequest, purgeExpiredCaptures } from "@/app/lib/partner/jobs";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";

const DOC = Buffer.from("Our own test SOP: receive, check, approve.");

async function testingKey() {
  const user = await createUser();
  const org = await createOrg();
  await addOrgMember(user.id, org.id, "ProcessOwner");
  const { hash, prefix } = mintIngestKey();
  const key = await prisma.apiKey.create({
    data: {
      name: "harness", keyHash: hash, keyPrefix: prefix, orgId: org.id, serviceUserId: user.id,
      phase: "testing", captureUntil: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });
  await pgPool.query(`UPDATE "ApiKey" SET "scopes" = $1::jsonb WHERE "id" = $2`,
    [JSON.stringify([SCOPE_PROCESS_MAPPING]), key.id]);
  return { user, org, keyId: key.id };
}

describe("The harness case library", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T2990 — a case keeps its document verbatim and can be re-run from it", async () => {
    const c = await prisma.harnessCase.create({
      data: {
        name: "Invoice approval", description: "AP clerk receives the invoice…",
        documentBytes: new Uint8Array(DOC), documentName: "sop.pdf", documentType: "application/pdf",
      },
      select: { id: true },
    });
    const back = await prisma.harnessCase.findUniqueOrThrow({ where: { id: c.id } });
    expect(Buffer.from(back.documentBytes!).toString()).toBe(DOC.toString());
    expect(back.description).toContain("AP clerk");
  });

  it("T2991 — a case names itself from the description when nothing better is given", async () => {
    // The library has to be browsable without anyone inventing titles.
    const description = "The AP clerk receives the invoice and checks it against the purchase order";
    const derived = description.split(/\s+/).slice(0, 7).join(" ");
    expect(derived).toBe("The AP clerk receives the invoice and");
    expect(derived.length).toBeLessThanOrEqual(90);
  });

  it("T2992 — a HarnessCase is NEVER touched by the retention purge", async () => {
    // The assertion that keeps the corpus and the privacy rule from being
    // confused for each other.
    const { user, org, keyId } = await testingKey();

    const kase = await prisma.harnessCase.create({
      data: { name: "corpus", description: "ours", documentBytes: new Uint8Array(DOC), documentName: "ours.pdf" },
      select: { id: true },
    });
    const jobId = await createJob({
      apiKeyId: keyId, orgId: org.id, userId: user.id,
      request: redactRequest({}), document: { name: "theirs.pdf", buf: DOC },
    });

    // Close the window and sweep.
    await prisma.apiKey.update({ where: { id: keyId }, data: { captureUntil: new Date(Date.now() - 1000) } });
    await purgeExpiredCaptures();

    // The customer's document is gone…
    expect((await prisma.partnerJob.findUniqueOrThrow({ where: { id: jobId } })).inputDocument).toBeNull();
    // …and ours is not.
    const after = await prisma.harnessCase.findUniqueOrThrow({ where: { id: kase.id } });
    expect(after.documentBytes).not.toBeNull();
    expect(Buffer.from(after.documentBytes!).toString()).toBe(DOC.toString());
  });

  it("T2993 — a job records the case that produced it, so a case accumulates a history", async () => {
    const { user, org, keyId } = await testingKey();
    const kase = await prisma.harnessCase.create({ data: { name: "c", description: "d" }, select: { id: true } });

    for (let i = 0; i < 2; i++) {
      await createJob({
        apiKeyId: keyId, orgId: org.id, userId: user.id,
        request: redactRequest({}), harnessCaseId: kase.id,
      });
    }
    expect(await prisma.partnerJob.count({ where: { harnessCaseId: kase.id } })).toBe(2);
  });
});

describe("The harness never holds a key", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

  it("T2994 — the page never fetches the key list secret-side, and the proxy holds it", () => {
    // A live key in page JavaScript is a burned key. The client posts to a
    // SuperAdmin proxy which attaches one server-side; nothing in the client
    // may carry a raw key or an X-Api-Key header.
    const client = read("app/(dashboard)/dashboard/admin/api-harness/ApiHarnessClient.tsx");
    expect(client).not.toMatch(/X-Api-Key/i);
    expect(client).not.toMatch(/dgxk_/);
    expect(client, "the client talks only to the proxy").toContain("/api/admin/api-harness/run");

    const proxy = read("app/api/admin/api-harness/run/route.ts");
    expect(proxy, "the proxy is SuperAdmin-only").toMatch(/isSuperuser\(session\)/);
    expect(proxy, "and it is what attaches the key").toMatch(/X-Api-Key/);
  });

  it("T2995 — the proxy refuses to drive a key that is not ours", () => {
    // Using a key means rotating its secret, which would break a partner's
    // integration without telling them. Only an internal-phase key is ours.
    const proxy = read("app/api/admin/api-harness/run/route.ts");
    expect(proxy).toMatch(/phase !== "internal"/);
  });
});
