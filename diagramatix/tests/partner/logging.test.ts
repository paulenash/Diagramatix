/**
 * Partner API — the traffic log.
 *
 * The log sits at the EDGE, in a wrapper, for two reasons this file pins:
 *
 *  1. A PartnerJob row only exists for a call that got far enough to be
 *     accepted. A 401 from a wrong header — the commonest symptom of a botched
 *     integration — never creates one, so logging inside the handler would miss
 *     precisely the calls you need. T2958.
 *  2. A route cannot be trusted to remember. T2962 is a source-text tripwire
 *     over `app/api/public/**`, the same idiom as `route-protection.test.ts`.
 *
 * What is KEPT is decided by the key's phase and nothing else — T2959/T2960.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { prisma, pgPool } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser, createOrg, addOrgMember } from "../_setup/factories";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { withPartnerLogging } from "@/app/lib/partner/logging";
import { SCOPE_PROCESS_MAPPING, BODY_CAPTURE_LIMIT } from "@/app/lib/partner/types";

async function mintKey(orgId: string, serviceUserId: string, phase: string, captureUntil: Date | null) {
  const { key, hash, prefix } = mintIngestKey();
  const row = await prisma.apiKey.create({
    data: { name: "k", keyHash: hash, keyPrefix: prefix, orgId, serviceUserId, phase, captureUntil },
    select: { id: true },
  });
  await pgPool.query(`UPDATE "ApiKey" SET "scopes" = $1::jsonb WHERE "id" = $2`,
    [JSON.stringify([SCOPE_PROCESS_MAPPING]), row.id]);
  return { key, id: row.id, prefix };
}

/** A handler that echoes, so the wrapper has something to log on both sides. */
const echo = (opts: { apiKeyId?: string; keyPrefix?: string; capturing?: boolean } = {}) =>
  withPartnerLogging(async (req, ref) => ({
    response: new Response(JSON.stringify({ ok: true, ref, echoed: await req.text() }), {
      status: 200, headers: { "Content-Type": "application/json" },
    }),
    ...opts,
  }));

const post = (body: string, key?: string) =>
  new Request("https://example.test/api/public/v1/process-map", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(key ? { "X-Api-Key": key } : {}) },
    body,
  });

/** The wrapper writes its row without awaiting; give it a beat to land. */
const settle = () => new Promise((r) => setTimeout(r, 150));

describe("Partner API — request logging", () => {
  beforeEach(async () => { await truncateAll(); });

  it("T2957 — every call gets a row, and the ref on it matches the response header", async () => {
    const res = await echo()(post(`{"description":"hello"}`));
    await settle();
    const rows = await prisma.partnerRequest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].ref).toBe(res.headers.get("X-Diagramatix-Request-Id"));
    expect(rows[0].method).toBe("POST");
    expect(rows[0].status).toBe(200);
    expect(rows[0].requestBytes).toBeGreaterThan(0);
    expect(rows[0].responseBytes).toBeGreaterThan(0);
  });

  it("T2958 — a call that never reaches a handler is STILL logged", async () => {
    // The whole reason the log is a wrapper. A 401 storm is the commonest
    // integration symptom and it creates no job to hang a log off.
    const handler = withPartnerLogging(async (_req, ref) => ({
      response: new Response(JSON.stringify({ error: { code: "invalid_key" }, ref }), { status: 401 }),
      errorCode: "invalid_key",
    }));
    await handler(post(`{}`));
    await settle();
    const rows = await prisma.partnerRequest.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(401);
    expect(rows[0].errorCode).toBe("invalid_key");
    expect(rows[0].apiKeyId).toBeNull();
  });

  it("T2959 — a LIVE key stores metadata but no bodies", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const k = await mintKey(org.id, user.id, "live", null);

    await echo({ apiKeyId: k.id, keyPrefix: k.prefix, capturing: false })(
      post(`{"description":"a customer's private process"}`, k.key));
    await settle();

    const row = await prisma.partnerRequest.findFirstOrThrow();
    expect(row.requestBody).toBeNull();
    expect(row.responseBody).toBeNull();
    expect(row.requestHeaders).toBeNull();
    // …but enough to see THAT something happened, and how big it was.
    expect(row.requestBytes).toBeGreaterThan(0);
    expect(row.status).toBe(200);
    expect(row.keyPrefix).toBe(k.prefix);
  });

  it("T2960 — a TESTING key stores bodies, truncated, and never the key itself", async () => {
    const user = await createUser();
    const org = await createOrg();
    await addOrgMember(user.id, org.id, "ProcessOwner");
    const k = await mintKey(org.id, user.id, "testing", new Date(Date.now() + 86_400_000));

    const big = `{"document":"${"A".repeat(BODY_CAPTURE_LIMIT * 3)}"}`;
    await echo({ apiKeyId: k.id, keyPrefix: k.prefix, capturing: true })(post(big, k.key));
    await settle();

    const row = await prisma.partnerRequest.findFirstOrThrow();
    expect(row.requestBody).not.toBeNull();
    // Truncated — the envelope is a fingerprint, the document lives whole on the
    // job instead of twice here.
    expect(row.requestBody!.length).toBeLessThan(big.length);
    expect(row.requestBody!).toContain("bytes total");
    expect(row.requestHeaders).not.toBeNull();

    // The strongest form of the redaction check: the key is in NO column.
    expect(JSON.stringify(row)).not.toContain(k.key);
    expect(row.requestHeaders!).toContain("[redacted");
  });

  it("T2961 — a handler that throws still produces a row and a clean 500", async () => {
    const handler = withPartnerLogging(async () => { throw new Error("boom: internal detail"); });
    const res = await handler(post(`{}`));
    await settle();

    expect(res.status).toBe(500);
    const body = await res.text();
    // The caller learns nothing about our internals.
    expect(body).not.toContain("boom");
    expect(body).toContain("server_error");

    const row = await prisma.partnerRequest.findFirstOrThrow();
    expect(row.status).toBe(500);
    expect(row.errorCode).toBe("server_error");
  });
});

describe("Partner API — every public route is guarded and logged", () => {
  const dir = join(process.cwd(), "app/api/public");

  function routesUnder(d: string): string[] {
    if (!existsSync(d)) return [];
    const out: string[] = [];
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      if (statSync(full).isDirectory()) out.push(...routesUnder(full));
      else if (name === "route.ts") out.push(full);
    }
    return out;
  }

  /**
   * The ONE route that may be open: the self-describing contract at
   * /api/public/v1. Requiring a key to read the documentation is the kind of
   * friction that produces a support email instead of an integration.
   *
   * Named here rather than pattern-matched, and T2963 proves it cannot become a
   * data leak — so widening the exception means editing two tests, on purpose.
   */
  const OPEN_ROUTES = ["/app/api/public/v1/route.ts"];
  const rel = (p: string) => p.replace(process.cwd(), "").split("\\").join("/");

  it("T2962 — no route under app/api/public/** may skip authenticatePartner or withPartnerLogging", () => {
    const routes = routesUnder(dir).filter((r) => !OPEN_ROUTES.includes(rel(r)));
    expect(routes.length, "there should be at least one guarded public route by now").toBeGreaterThan(0);

    const unguarded = routes.filter((r) => !/authenticatePartner\s*\(/.test(readFileSync(r, "utf8")));
    const unlogged = routes.filter((r) => !/withPartnerLogging\s*\(/.test(readFileSync(r, "utf8")));

    expect(unguarded.map(rel), "these are reachable without a key").toEqual([]);
    expect(unlogged.map(rel), "these would leave no trace of a call").toEqual([]);
  });

  it("T2963 — the open route cannot leak: it reads no database and no request body", () => {
    // An open route that grew a Prisma import would stop being documentation and
    // start being an unauthenticated data endpoint, silently.
    for (const r of OPEN_ROUTES) {
      const src = readFileSync(join(process.cwd(), r.slice(1)), "utf8");
      expect(src, `${r} must not touch the database`).not.toMatch(/lib\/db/);
      expect(src, `${r} must not read a request body`).not.toMatch(/req\.(json|text|formData)\s*\(/);
    }
  });
});
