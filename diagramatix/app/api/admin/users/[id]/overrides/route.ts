/**
 * SuperAdmin: customise ONE person — their limits, settings and feature availability —
 * without changing the subscription level they are on, and revert them to the level.
 * In addition to the comp grant (Grant comp / Revoke comp), which is separate.
 *
 *   GET    → { level, limits[], features[], note, expiresAt, expired, customised }
 *            each row: plan value · override (if any) · in effect · covered (a grant the plan now gives)
 *   PUT    { limits?: { <field>: number | null | boolean | "inherit" },
 *            features?: { <feature>: "available"|"disabled"|"hidden"|"inherit" },
 *            note?: string, expiresAt?: ISO date | null }
 *          Only the keys sent change; "inherit" reverts that one key to the plan. A NOTE is required
 *          whenever anything is customised (the audit trail for "why does this person have 200 projects").
 *   DELETE → revert EVERYTHING (limits, features, note, expiry) to the plan.
 *
 * The rule for what an override does lives in app/lib/features/userOverrides.ts. SuperAdmin only,
 * blocked during read-only impersonation, every change audited.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma, pgPool } from "@/app/lib/db";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { recordAudit, auditActor, AUDIT } from "@/app/lib/audit";
import { FEATURE_KEYS } from "@/app/lib/features/registry";
import { getLevelMatrix } from "@/app/lib/features/availability";
import { resolveEffectiveLevel } from "@/app/lib/features/effectiveLevel";
import {
  coerceLimitValue, describeFeatures, describeLimits, hasAnyOverride, isLimitKey, overridesExpired,
  type FState, type FeatureOverrides, type LimitOverrides, type LimitValue,
} from "@/app/lib/features/userOverrides";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const STATES = new Set(["available", "disabled", "hidden"]);

/** The person's plan values (level = comp / organisation / own — never the acted-as level, never overrides). */
async function planFor(userId: string) {
  const eff = await resolveEffectiveLevel(userId);
  if (!eff) return null;
  const level = await prisma.subscriptionLevel.findUnique({ where: { id: eff.id } });
  if (!level) return null;
  const matrix = await getLevelMatrix(eff.id);
  return { id: eff.id, name: level.name, row: level as unknown as Record<string, unknown>, matrix };
}

async function snapshot(id: string) {
  const u = await prisma.user.findUnique({ where: { id }, select: { limitOverrides: true, featureOverrides: true, overrideNote: true, overridesExpireAt: true } });
  const plan = await planFor(id);
  if (!u || !plan) return null;
  return {
    level: { id: plan.id, name: plan.name },
    limits: describeLimits(plan.row, u.limitOverrides, u.overridesExpireAt),
    features: describeFeatures(plan.matrix, u.featureOverrides, FEATURE_KEYS, u.overridesExpireAt),
    note: u.overrideNote,
    expiresAt: u.overridesExpireAt ? u.overridesExpireAt.toISOString() : null,
    expired: overridesExpired(u.overridesExpireAt),
    customised: hasAnyOverride(u.limitOverrides, u.featureOverrides),
  };
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const { id } = await params;
  const snap = await snapshot(id);
  return snap ? NextResponse.json(snap) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;
  const { id } = await params;

  let body: { limits?: Record<string, unknown>; features?: Record<string, unknown>; note?: unknown; expiresAt?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const u = await prisma.user.findUnique({ where: { id }, select: { limitOverrides: true, featureOverrides: true, overrideNote: true, overridesExpireAt: true } });
  const plan = await planFor(id);
  if (!u || !plan) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const limits: LimitOverrides = { ...((u.limitOverrides ?? {}) as LimitOverrides) };
  const features: FeatureOverrides = { ...((u.featureOverrides ?? {}) as FeatureOverrides) };
  const changed: { limits: Record<string, unknown>; features: Record<string, unknown> } = { limits: {}, features: {} };

  for (const [k, raw] of Object.entries(body.limits ?? {})) {
    if (!isLimitKey(k)) return NextResponse.json({ error: `Unknown limit "${k}"` }, { status: 400 });
    if (raw === "inherit") { changed.limits[k] = { from: limits[k]?.v ?? "plan", to: "plan" }; delete limits[k]; continue; }
    const c = coerceLimitValue(k, raw);
    if (!c.ok) return NextResponse.json({ error: c.error }, { status: 400 });
    // base = what the plan gives NOW: the reference for "does a later plan already cover this?"
    limits[k] = { v: c.value, base: (plan.row[k] as LimitValue) ?? null };
    changed.limits[k] = { from: "plan", to: c.value };
  }
  for (const [k, raw] of Object.entries(body.features ?? {})) {
    if (!FEATURE_KEYS.includes(k)) return NextResponse.json({ error: `Unknown feature "${k}"` }, { status: 400 });
    if (raw === "inherit") { changed.features[k] = "plan"; delete features[k]; continue; }
    if (typeof raw !== "string" || !STATES.has(raw)) return NextResponse.json({ error: `Feature "${k}" must be available, disabled, hidden or inherit` }, { status: 400 });
    features[k] = { s: raw as FState, base: (plan.matrix[k] ?? "available") as FState };
    changed.features[k] = raw;
  }

  const anyOverride = Object.keys(limits).length > 0 || Object.keys(features).length > 0;
  const note = typeof body.note === "string" ? body.note.trim() : (u.overrideNote ?? "");
  if (anyOverride && !note) return NextResponse.json({ error: "A note is required: say why this person is customised." }, { status: 400 });

  let expiresAt: Date | null = u.overridesExpireAt;
  if (body.expiresAt !== undefined) {
    if (body.expiresAt === null || body.expiresAt === "") expiresAt = null;
    else {
      const d = new Date(String(body.expiresAt));
      if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) return NextResponse.json({ error: "The expiry must be a date in the future." }, { status: 400 });
      expiresAt = d;
    }
  }

  // Prisma 7 omits JSON fields from model update inputs → raw SQL.
  await pgPool.query(
    'UPDATE "User" SET "limitOverrides" = $1::jsonb, "featureOverrides" = $2::jsonb, "overrideNote" = $3, "overridesExpireAt" = $4 WHERE id = $5',
    [JSON.stringify(limits), Object.keys(features).length ? JSON.stringify(features) : null, anyOverride ? note : null, anyOverride ? expiresAt : null, id],
  );
  await recordAudit({
    ...auditActor(session, req), action: AUDIT.UserOverridesUpdate, targetType: "user", targetId: id,
    meta: { changed, hasNote: !!note, expiresAt: expiresAt ? expiresAt.toISOString() : null },
  });
  return NextResponse.json(await snapshot(id));
}

/** Revert EVERYTHING for this person to what their level gives. (Revoke comp is a separate button.) */
export async function DELETE(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const blocked = await blockReadOnlyImpersonation(session);
  if (blocked) return blocked;
  const { id } = await params;
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await pgPool.query('UPDATE "User" SET "limitOverrides" = \'{}\'::jsonb, "featureOverrides" = NULL, "overrideNote" = NULL, "overridesExpireAt" = NULL WHERE id = $1', [id]);
  await recordAudit({ ...auditActor(session, req), action: AUDIT.UserOverridesRevert, targetType: "user", targetId: id, meta: { all: true } });
  return NextResponse.json(await snapshot(id));
}

