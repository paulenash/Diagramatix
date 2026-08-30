/**
 * SuperAdmin — mint, list, amend and revoke Partner API keys.
 *
 * Two rules this route exists to enforce, both of which cost the whole feature
 * if they are wrong:
 *
 *  1. THE RAW KEY IS SHOWN ONCE. We store only its SHA-256. If it is lost it is
 *     re-minted, never recovered — which is also why the response says so.
 *  2. THE SERVICE USER MUST NOT BE A SUPERADMIN, and must not be an org Admin or
 *     Owner. Admin trips `isAdminElevatedForOrg`, which grants silent owner
 *     access to every project in the org — through a key held by a third party.
 *     Checked here, and again on every call in `authenticatePartner`.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma, pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { recordAudit, auditActor } from "@/app/lib/audit";
import {
  isApiKeyPhase, MAX_CAPTURE_DAYS, SCOPE_PROCESS_MAPPING, type ApiKeyPhase,
} from "@/app/lib/partner/types";

export const dynamic = "force-dynamic";

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/** Never returns the hash, and could never return the key. */
function shape(k: {
  id: string; name: string; keyPrefix: string; orgId: string; serviceUserId: string;
  scopes: unknown; projectId: string | null; phase: string; captureUntil: Date | null;
  rateLimitPerMin: number; dailyJobLimit: number; revokedAt: Date | null; expiresAt: Date | null;
  lastUsedAt: Date | null; useCount: number; createdAt: Date;
  org?: { name: string } | null; serviceUser?: { email: string } | null; project?: { name: string } | null;
}) {
  return {
    id: k.id, name: k.name, prefix: k.keyPrefix,
    org: k.org?.name ?? null, orgId: k.orgId,
    serviceUser: k.serviceUser?.email ?? null,
    project: k.project?.name ?? null, projectId: k.projectId,
    scopes: Array.isArray(k.scopes) ? k.scopes : [],
    phase: k.phase, captureUntil: k.captureUntil,
    rateLimitPerMin: k.rateLimitPerMin, dailyJobLimit: k.dailyJobLimit,
    revokedAt: k.revokedAt, expiresAt: k.expiresAt,
    lastUsedAt: k.lastUsedAt, useCount: k.useCount, createdAt: k.createdAt,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();
  const keys = await prisma.apiKey.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      org: { select: { name: true } },
      serviceUser: { select: { email: true } },
      project: { select: { name: true } },
    },
  });
  return NextResponse.json({ keys: keys.map(shape) });
}

/**
 * Validate a phase / expiry pair.
 *
 * `testing` without a window is the mistake this catches. A capture window with
 * no end is not time-boxed, and "we will turn it off later" is how a partner's
 * documents end up living here indefinitely.
 */
function checkPhase(phase: ApiKeyPhase, captureUntil: Date | null): string | null {
  if (phase !== "testing") return null;
  if (!captureUntil) return "The testing phase needs an end date — that is what makes it time-boxed.";
  if (Number.isNaN(captureUntil.getTime())) return "That end date is not a valid date.";
  const max = Date.now() + MAX_CAPTURE_DAYS * 86_400_000;
  if (captureUntil.getTime() > max) return `A testing window cannot run more than ${MAX_CAPTURE_DAYS} days.`;
  if (captureUntil.getTime() <= Date.now()) return "That end date is already in the past.";
  return null;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as {
    name?: string; orgId?: string; serviceUserEmail?: string; projectId?: string | null;
    phase?: string; captureUntil?: string | null;
    rateLimitPerMin?: number; dailyJobLimit?: number; expiresAt?: string | null;
  } | null;

  const name = body?.name?.trim();
  const orgId = body?.orgId?.trim();
  const email = body?.serviceUserEmail?.trim().toLowerCase();
  if (!name || !orgId || !email) {
    return NextResponse.json({ error: "name, orgId and serviceUserEmail are required" }, { status: 400 });
  }

  const phase = isApiKeyPhase(body?.phase) ? body.phase : "live";
  const captureUntil = body?.captureUntil ? new Date(body.captureUntil) : null;
  const phaseErr = checkPhase(phase, captureUntil);
  if (phaseErr) return NextResponse.json({ error: phaseErr }, { status: 400 });

  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "That organisation does not exist" }, { status: 404 });

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return NextResponse.json({ error: `No user with the email ${email}` }, { status: 404 });

  if (isSuperuser({ user: { email: user.email } })) {
    return NextResponse.json(
      { error: "A partner key cannot act as a SuperAdmin. Use a dedicated service account." },
      { status: 400 },
    );
  }

  const member = await prisma.orgMember.findFirst({
    where: { orgId, userId: user.id }, select: { role: true },
  });
  if (!member) {
    return NextResponse.json({ error: "That user is not a member of that organisation" }, { status: 400 });
  }
  if (member.role === "Admin" || member.role === "Owner") {
    return NextResponse.json(
      { error: `That user is ${member.role} of the org, which grants owner access to every project in it. Use a ProcessOwner service account.` },
      { status: 400 },
    );
  }

  const { key, hash, prefix } = mintIngestKey();
  const created = await prisma.apiKey.create({
    data: {
      name, keyHash: hash, keyPrefix: prefix, orgId, serviceUserId: user.id,
      projectId: body?.projectId || null,
      phase, captureUntil,
      rateLimitPerMin: body?.rateLimitPerMin ?? 30,
      dailyJobLimit: body?.dailyJobLimit ?? 50,
      expiresAt: body?.expiresAt ? new Date(body.expiresAt) : null,
      createdById: session.user.id,
    },
    select: { id: true },
  });

  // Prisma 7 omits Json fields from the model create input, so the scopes list
  // is written with raw SQL — the house rule for every Json column.
  await pgPool.query(
    `UPDATE "ApiKey" SET "scopes" = $1::jsonb WHERE "id" = $2`,
    [JSON.stringify([SCOPE_PROCESS_MAPPING]), created.id],
  );

  await recordAudit({
    ...auditActor(session, req),
    orgId, action: "partner.key.mint", targetType: "apiKey", targetId: created.id,
    meta: {
      name, prefix, phase, serviceUser: email,
      captureUntil: captureUntil ? captureUntil.toISOString() : null,
    },
  });

  // The only moment the raw key exists outside the caller's hands.
  return NextResponse.json({ id: created.id, key, prefix, shownOnce: true });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as
    | { id?: string; action?: string; phase?: string; captureUntil?: string | null }
    | null;
  const id = body?.id?.trim();
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const key = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, name: true, keyPrefix: true, orgId: true, phase: true },
  });
  if (!key) return NextResponse.json({ error: "No such key" }, { status: 404 });

  if (body?.action === "revoke") {
    await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
    await recordAudit({
      ...auditActor(session, req), orgId: key.orgId,
      action: "partner.key.revoke", targetType: "apiKey", targetId: id,
      meta: { name: key.name, prefix: key.keyPrefix },
    });
    return NextResponse.json({ ok: true, revoked: true });
  }

  if (body?.action === "set-phase") {
    const phase = isApiKeyPhase(body.phase) ? body.phase : null;
    if (!phase) return NextResponse.json({ error: "phase must be internal, testing or live" }, { status: 400 });
    const captureUntil = body.captureUntil ? new Date(body.captureUntil) : null;
    const err = checkPhase(phase, captureUntil);
    if (err) return NextResponse.json({ error: err }, { status: 400 });

    // GOING LIVE RETIRES THE TEST DATA. Not "stops collecting" — clears what was
    // collected. Leaving a partner's documents lying around until a sweep
    // notices is the thing the phase model exists to prevent.
    let purged = 0;
    if (phase === "live" && key.phase === "testing") {
      const r = await prisma.partnerRequest.updateMany({
        where: { apiKeyId: id, NOT: { requestBody: null } },
        data: { requestBody: null, responseBody: null, requestHeaders: null },
      });
      purged = r.count;
    }

    await prisma.apiKey.update({ where: { id }, data: { phase, captureUntil } });
    await recordAudit({
      ...auditActor(session, req), orgId: key.orgId,
      action: "partner.key.phase", targetType: "apiKey", targetId: id,
      meta: {
        name: key.name, prefix: key.keyPrefix, from: key.phase, to: phase,
        purgedBodies: purged, captureUntil: captureUntil ? captureUntil.toISOString() : null,
      },
    });
    return NextResponse.json({ ok: true, phase, purgedBodies: purged });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
