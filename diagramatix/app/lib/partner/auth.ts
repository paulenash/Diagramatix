/**
 * Turning a partner API key into something the rest of the app already trusts.
 *
 * Every existing helper — `requireRole`, `gateLimit`, `recordUsage`, the AI
 * telemetry context — is written against a signed-in user. Rather than fork all
 * of that for machine callers, a key resolves to its bound org and service user
 * and we synthesise the two structural values those helpers actually take: a
 * `SessionLike` and a cookie store. Neither is a NextAuth type; both are plain
 * interfaces in `orgContext.ts`, so this needs no change there at all.
 *
 * THE COOKIE STUB IS LOAD-BEARING, not ceremony:
 *
 *   `getCurrentOrgId` reads `dgx_org` FIRST — and still verifies the user is a
 *   member of that org — but falls back to the user's OLDEST OrgMember row. So
 *   without the stub, a service user who ever joins a second org would silently
 *   start writing into the wrong tenant. Pinning the key's org through the
 *   cookie keeps the membership check and removes the ambiguity. That is the
 *   subtlest hazard in this feature and it has its own test.
 *
 *   The same stub returns undefined for `dgx_view_as`, so impersonation is
 *   impossible here by construction as well as by permission.
 */
import { prisma } from "@/app/lib/db";
import { ORG_COOKIE, type CookieStore, type SessionLike } from "@/app/lib/auth/orgContext";
import { readIngestKey, sha256, verifyIngestKey } from "@/app/lib/mining/sourceAuth";
import { isSuperuser } from "@/app/lib/superuser";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";
import { partnerError, type PartnerErrorCode } from "./errors";
import { isCapturing, type ApiKeyPhase } from "./types";
import type { NextResponse } from "next/server";

export interface PartnerCaller {
  apiKeyId: string;
  keyName: string;
  keyPrefix: string;
  orgId: string;
  userId: string;
  scopes: string[];
  projectId: string | null;
  phase: ApiKeyPhase;
  /** Is this key keeping request bodies and documents right now? */
  capturing: boolean;
  rateLimitPerMin: number;
  dailyJobLimit: number;
  /** What `requireRole` / `gateLimit` / telemetry are handed. */
  session: SessionLike;
  cookies: CookieStore;
}

/** A failure that should become a response, carrying the code so the logging
 *  wrapper can record it without re-parsing the body. */
export interface PartnerAuthFailure {
  ok: false;
  code: PartnerErrorCode;
  response: NextResponse;
}
export type PartnerAuthResult = { ok: true; caller: PartnerCaller } | PartnerAuthFailure;

const fail = (code: PartnerErrorCode, message: string, ref?: string, headers?: Record<string, string>): PartnerAuthFailure =>
  ({ ok: false, code, response: partnerError(code, message, { ref, headers }) });

/**
 * Authenticate a request and bind it to its org and service user.
 *
 * @param scope the capability this route needs; a key without it is 403, which
 *              is deliberately distinct from the 401 of a bad key — "your key is
 *              wrong" and "your key cannot do this" are different problems.
 */
export async function authenticatePartner(
  req: Request,
  scope: string,
  ref?: string,
): Promise<PartnerAuthResult> {
  const presented = readIngestKey(req.headers);
  if (!presented) {
    return fail("invalid_key", "Supply your key in an X-Api-Key or Authorization: Bearer header.", ref);
  }

  /**
   * Brute-force guard, charged ONLY WHEN AUTHENTICATION FAILS.
   *
   * The first version consumed a token on every attempt, which made it a cap on
   * legitimate traffic wearing a security label — and it caught its own harness
   * first, since polling every few seconds from one loopback address burns 20
   * a minute without a single bad key. Volume from a VALID key is limited
   * per-key at the route, where the key's own configured limit applies.
   *
   * Keyed on the caller rather than the key, because somebody guessing keys has
   * no valid key to be limited against.
   */
  const charge = () => rateLimit(`partner:auth:${clientIp(req.headers)}`, 20, 60_000);
  const refuse = (code: PartnerErrorCode, message: string): PartnerAuthFailure => {
    const rl = charge();
    return rl.ok
      ? fail(code, message, ref)
      : fail("rate_limited", "Too many failed authentication attempts. Try again shortly.", ref,
          { "Retry-After": String(rl.retryAfterSec) });
  };

  // EXACT-HASH lookup. Never a prefix lookup followed by a compare — the prefix
  // is for humans reading a list, not for finding a row to trust.
  const row = await prisma.apiKey.findUnique({
    where: { keyHash: sha256(presented) },
    include: { serviceUser: { select: { id: true, email: true } } },
  });
  // Constant-time confirmation even though the lookup already matched, so the
  // two key paths in this codebase behave identically.
  if (!row || !verifyIngestKey(presented, row.keyHash)) {
    return refuse("invalid_key", "That key is not recognised.");
  }
  if (row.revokedAt) {
    return refuse("key_revoked", "That key has been revoked.");
  }
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    return refuse("key_revoked", "That key has expired.");
  }

  const scopes = Array.isArray(row.scopes) ? (row.scopes as unknown[]).filter((s): s is string => typeof s === "string") : [];
  if (!scopes.includes(scope)) {
    return fail("scope_denied", `That key does not carry the "${scope}" scope.`, ref);
  }

  // FAIL CLOSED. A service user who is also a SuperAdmin would unlock
  // impersonation, arbitrary model choice and every admin surface — through a
  // key held by a third party. This should be impossible at mint time; it is
  // checked again here because the cost of being wrong is total.
  if (isSuperuser({ user: { email: row.serviceUser.email } })) {
    console.error(`[partner] REFUSED: key ${row.keyPrefix} has a SuperAdmin service user`);
    return fail("invalid_key", "That key is not usable.", ref);
  }

  return {
    ok: true,
    caller: {
      apiKeyId: row.id,
      keyName: row.name,
      keyPrefix: row.keyPrefix,
      orgId: row.orgId,
      userId: row.serviceUserId,
      scopes,
      projectId: row.projectId,
      phase: row.phase as ApiKeyPhase,
      capturing: isCapturing(row),
      rateLimitPerMin: row.rateLimitPerMin,
      dailyJobLimit: row.dailyJobLimit,
      session: { user: { id: row.serviceUserId, email: row.serviceUser.email } },
      cookies: {
        // Pins the org. See the note at the top of this file — without it,
        // `getCurrentOrgId` falls through to the oldest membership.
        get: (name: string) => (name === ORG_COOKIE ? { value: row.orgId } : undefined),
      },
    },
  };
}

/** Fire-and-forget usage stamp. Never allowed to fail a request. */
export async function touchKey(apiKeyId: string, ip: string | null): Promise<void> {
  try {
    await prisma.apiKey.update({
      where: { id: apiKeyId },
      data: { lastUsedAt: new Date(), lastUsedIp: ip, useCount: { increment: 1 } },
    });
  } catch { /* telemetry must not break the call */ }
}
