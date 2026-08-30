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
import { rememberHarnessSecret } from "@/app/lib/partner/harnessSecret";
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

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  // Nobody should have to know an internal id to mint a key. The form asks for
  // an organisation and a service account; this is what fills those dropdowns,
  // and it marks who is ELIGIBLE rather than letting the mint fail later:
  // a SuperAdmin cannot be a service account at all, and an org Admin or Owner
  // would hand the key owner access to every project in the org.
  if (new URL(req.url).searchParams.get("lookup") === "orgs") {
    const orgs = await prisma.org.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true, name: true,
        members: { select: { role: true, user: { select: { id: true, email: true } } } },
      },
    });
    return NextResponse.json({
      orgs: orgs.map((o) => ({
        id: o.id,
        name: o.name,
        members: o.members.map((m) => {
          const superAdmin = isSuperuser({ user: { email: m.user.email } });
          const elevated = m.role === "Admin" || m.role === "Owner";
          return {
            email: m.user.email,
            role: m.role,
            eligible: !superAdmin && !elevated,
            why: superAdmin
              ? "A SuperAdmin cannot be a service account — the key would inherit impersonation and every admin surface."
              : elevated
                ? `${m.role} of this org grants owner access to every project in it.`
                : null,
          };
        }),
      })),
    });
  }
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
    /** "harness" — provision our own org and service account and mint an
     *  internal key, in one step. */
    preset?: string;
    /** Create a service account in the chosen org rather than requiring one to
     *  exist. A real partner org has exactly one member — its owner — and an
     *  owner cannot be a service account, so without this there is nobody to
     *  mint against. */
    createServiceAccount?: boolean;
  } | null;

  let name = body?.name?.trim();
  let orgId = body?.orgId?.trim();
  let email = body?.serviceUserEmail?.trim().toLowerCase();

  /**
   * THE INTERNAL KEY NEEDS NO CHOICES.
   *
   * An org and a service account exist because everything a key does is done as
   * a user in an org — a generated diagram has to land somewhere. For a partner
   * that is a real decision. For OUR OWN harness key it is not: the org is ours,
   * the account is a robot, and asking a SuperAdmin to hunt for a non-Owner
   * member is friction with no benefit. On a fresh install there is no eligible
   * member at all, since every member of every org tends to be its Owner.
   *
   * So the harness provisions its own, once, and reuses it after.
   */
  if (body?.preset === "harness") {
    const ORG_NAME = "Diagramatix Harness";
    const SERVICE_EMAIL = "harness@diagramatix.internal";

    let org = await prisma.org.findFirst({ where: { name: ORG_NAME }, select: { id: true } });
    if (!org) org = await prisma.org.create({ data: { name: ORG_NAME }, select: { id: true } });

    let svc = await prisma.user.findUnique({ where: { email: SERVICE_EMAIL }, select: { id: true } });
    if (!svc) {
      svc = await prisma.user.create({
        // No password: this account exists to be acted AS, never signed in as.
        // Same reasoning as a partner service account: with no tier the key
        // stops working after a few calls for a reason nobody would guess.
        data: {
          email: SERVICE_EMAIL, name: "Process API Harness", password: "",
          subscriptionLevelId: (await prisma.subscriptionLevel.findFirst({
            orderBy: { sortOrder: "desc" }, select: { id: true },
          }))?.id ?? null,
          subscriptionAssignedAt: new Date(),
        },
        select: { id: true },
      });
    }
    const existing = await prisma.orgMember.findFirst({ where: { orgId: org.id, userId: svc.id }, select: { id: true } });
    if (!existing) {
      // ProcessOwner, never Admin — Admin would grant owner access to every
      // project in the org, which is the thing this feature refuses everywhere
      // else and should not grant itself.
      await prisma.orgMember.create({ data: { orgId: org.id, userId: svc.id, role: "ProcessOwner" } });
    }

    orgId = org.id;
    email = SERVICE_EMAIL;
    name = name || "Harness (scratch)";
  }

  if (body?.createServiceAccount && orgId) {
    // A robot account for this org. It exists to be acted AS and can never sign
    // in: no password, and an address in a domain nobody receives mail at.
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, subscriptionLevelId: true },
    });
    if (!org) return NextResponse.json({ error: "That organisation does not exist" }, { status: 404 });

    const slug = org.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "org";
    email = `api-${slug}@diagramatix.internal`;

    let svc = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!svc) {
      // THE TIER MATTERS. Metering is keyed on the service user, and a user with
      // no subscription level runs out after a handful of calls with a message
      // about upgrading "your" plan — nonsense to a partner. It inherits the
      // org's level so the key draws on the same allowance as the org it serves.
      svc = await prisma.user.create({
        data: {
          email, name: `${org.name} — Process API`, password: "",
          subscriptionLevelId: org.subscriptionLevelId ?? null,
          subscriptionAssignedAt: org.subscriptionLevelId ? new Date() : null,
        },
        select: { id: true },
      });
    }
    const has = await prisma.orgMember.findFirst({ where: { orgId, userId: svc.id }, select: { id: true } });
    // ProcessOwner, never Admin — Admin grants owner access to every project in
    // the org, which is precisely what this feature refuses everywhere else.
    if (!has) await prisma.orgMember.create({ data: { orgId, userId: svc.id, role: "ProcessOwner" } });
  }

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

  // An INTERNAL key is ours, and the harness needs a secret it cannot read back
  // from a hash. Remembering it here means the key you were just shown keeps
  // working — the alternative was rotating it on first use, which silently
  // invalidated the key a moment after telling somebody to copy it.
  if (phase === "internal") rememberHarnessSecret(created.id, key);

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
