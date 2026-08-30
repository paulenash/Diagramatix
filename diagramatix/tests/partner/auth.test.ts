/**
 * Partner API — key authentication and, above all, ORG BINDING.
 *
 * A partner key resolves to an org and a service user, and everything the key
 * does is done as that user. Rather than fork `orgContext`, subscription
 * metering and AI telemetry for machine callers, `authenticatePartner`
 * synthesises the two structural values they already take — a `SessionLike` and
 * a cookie store — and pins the org through the cookie.
 *
 * T2948 is the reason this file exists. `getCurrentOrgId` reads `dgx_org` first
 * but falls back to the user's OLDEST OrgMember row, so without the stub a
 * service user who ever joins a second org would silently start writing into the
 * wrong tenant. The test deliberately binds the key to the YOUNGER membership,
 * so it fails if the fallback ever wins.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma, pgPool } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, addOrgMember } from "../_setup/factories";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { authenticatePartner, touchKey } from "@/app/lib/partner/auth";
import { getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";

/** Mint a real key row and hand back the raw key the caller would present. */
async function mintKey(opts: {
  orgId: string;
  serviceUserId: string;
  scopes?: string[];
  phase?: string;
  captureUntil?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
}) {
  const { key, hash, prefix } = mintIngestKey();
  const row = await prisma.apiKey.create({
    data: {
      name: "Test key", keyHash: hash, keyPrefix: prefix,
      orgId: opts.orgId, serviceUserId: opts.serviceUserId,
      phase: opts.phase ?? "live", captureUntil: opts.captureUntil ?? null,
      revokedAt: opts.revokedAt ?? null, expiresAt: opts.expiresAt ?? null,
    },
    select: { id: true },
  });
  await pgPool.query(`UPDATE "ApiKey" SET "scopes" = $1::jsonb WHERE "id" = $2`, [
    JSON.stringify(opts.scopes ?? [SCOPE_PROCESS_MAPPING]),
    row.id,
  ]);
  return { key, id: row.id, prefix };
}

const request = (key?: string) =>
  new Request("https://example.test/api/public/v1/whoami", {
    headers: key ? { "X-Api-Key": key } : {},
  });

describe("Partner API — authentication", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T2948 — a key resolves to ITS org, even when the service user's oldest membership is another one", async () => {
    const user = await createUser({ email: "svc@partner.test" });
    // Oldest membership FIRST — this is the one getCurrentOrgId would fall back
    // to, and it is deliberately NOT the org the key is bound to.
    const wrongOrg = await createOrg({ name: "Wrong Org (older)" });
    await addOrgMember(user.id, wrongOrg.id, "ProcessOwner");
    const rightOrg = await createOrg({ name: "Right Org (newer)" });
    await addOrgMember(user.id, rightOrg.id, "ProcessOwner");

    const { key } = await mintKey({ orgId: rightOrg.id, serviceUserId: user.id });
    const res = await authenticatePartner(request(key), SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.caller.orgId).toBe(rightOrg.id);
    // The real assertion: the stub survives a trip through the actual resolver
    // the rest of the app uses. Without it this returns the older org.
    await expect(getCurrentOrgId(res.caller.session, res.caller.cookies)).resolves.toBe(rightOrg.id);
  });

  it("T2949 — the cookie stub reveals no impersonation cookie", async () => {
    // A machine caller must never be able to act as somebody else. Belt and
    // braces: the cookie simply is not there, so getViewAsUserId finds nothing.
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const { key } = await mintKey({ orgId: org.id, serviceUserId: user.id });

    const res = await authenticatePartner(request(key), SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.caller.cookies.get("dgx_view_as")).toBeUndefined();
    expect(res.caller.cookies.get("dgx_view_as_mode")).toBeUndefined();
  });

  it("T2950 — a revoked key is refused, and an expired one too", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");

    const revoked = await mintKey({ orgId: org.id, serviceUserId: user.id, revokedAt: new Date() });
    const r1 = await authenticatePartner(request(revoked.key), SCOPE_PROCESS_MAPPING);
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe("key_revoked");

    const expired = await mintKey({
      orgId: org.id, serviceUserId: user.id, expiresAt: new Date(Date.now() - 1000),
    });
    const r2 = await authenticatePartner(request(expired.key), SCOPE_PROCESS_MAPPING);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe("key_revoked");
  });

  it("T2951 — a missing scope is 403 scope_denied, distinct from a bad key's 401", async () => {
    // "Your key is wrong" and "your key cannot do this" are different problems
    // and a partner needs to be able to tell them apart.
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const { key } = await mintKey({ orgId: org.id, serviceUserId: user.id, scopes: ["something-else"] });

    const res = await authenticatePartner(request(key), SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe("scope_denied");
    expect(res.response.status).toBe(403);

    const bad = await authenticatePartner(request("dgxk_" + "0".repeat(64)), SCOPE_PROCESS_MAPPING);
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.response.status).toBe(401);
  });

  it("T2952 — a service user who is a SuperAdmin is refused outright", async () => {
    // Fail closed. A SuperAdmin service user would hand a third party
    // impersonation, arbitrary model choice and every admin surface. This should
    // be impossible at mint time; it is checked again here because the cost of
    // being wrong is total.
    const emails = (process.env.SUPERUSER_EMAILS ?? "paul@nashcc.com.au").split(",");
    const user = await createUser({ email: emails[0]!.trim() });
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const { key } = await mintKey({ orgId: org.id, serviceUserId: user.id });

    const res = await authenticatePartner(request(key), SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.response.status).toBe(401);
  });

  it("T2953 — no key at all is a 401, not a crash", async () => {
    const res = await authenticatePartner(request(), SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("invalid_key");
  });

  it("T2954 — a key accepts the Bearer header as well as X-Api-Key", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const { key } = await mintKey({ orgId: org.id, serviceUserId: user.id });

    const req = new Request("https://example.test/api/public/v1/whoami", {
      headers: { Authorization: `Bearer ${key}` },
    });
    const res = await authenticatePartner(req, SCOPE_PROCESS_MAPPING);
    expect(res.ok).toBe(true);
  });

  it("T2955 — capturing is on only during an unexpired testing window", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");

    const open = await mintKey({
      orgId: org.id, serviceUserId: user.id,
      phase: "testing", captureUntil: new Date(Date.now() + 86_400_000),
    });
    const a = await authenticatePartner(request(open.key), SCOPE_PROCESS_MAPPING);
    expect(a.ok && a.caller.capturing).toBe(true);

    // An EXPIRED window degrades to live behaviour, so forgetting to move a key
    // fails safe rather than retaining forever.
    const closed = await mintKey({
      orgId: org.id, serviceUserId: user.id,
      phase: "testing", captureUntil: new Date(Date.now() - 1000),
    });
    const b = await authenticatePartner(request(closed.key), SCOPE_PROCESS_MAPPING);
    expect(b.ok && b.caller.capturing).toBe(false);

    const live = await mintKey({ orgId: org.id, serviceUserId: user.id, phase: "live" });
    const c = await authenticatePartner(request(live.key), SCOPE_PROCESS_MAPPING);
    expect(c.ok && c.caller.capturing).toBe(false);
  });

  it("T2956 — the usage stamp advances, and the raw key is nowhere in the row", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const { key, id } = await mintKey({ orgId: org.id, serviceUserId: user.id });

    await touchKey(id, "203.0.113.5");
    const row = await prisma.apiKey.findUniqueOrThrow({ where: { id } });
    expect(row.useCount).toBe(1);
    expect(row.lastUsedAt).not.toBeNull();
    expect(row.lastUsedIp).toBe("203.0.113.5");

    // The strongest form of the check: the key string appears in NO column.
    expect(JSON.stringify(row)).not.toContain(key);
  });
});
