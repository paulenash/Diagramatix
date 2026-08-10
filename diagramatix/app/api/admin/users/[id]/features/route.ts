/**
 * SuperAdmin per-user feature-availability OVERRIDES.
 *   GET → { overrides }  (the user's current override map; {} = none)
 *   PUT { overrides } → replace the map. Keys must be registry features; values
 *        available|disabled|hidden. A key set to "inherit" (or omitted) is removed,
 *        so the user falls back to their subscription-level matrix for it.
 * SuperAdmin only. Mirrors app/api/admin/users/[id]/comp/route.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma, pgPool } from "@/app/lib/db";
import { FEATURE_KEYS } from "@/app/lib/features/registry";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
const STATES = new Set(["available", "disabled", "hidden"]);

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const { id } = await params;
  const u = await prisma.user.findUnique({ where: { id }, select: { featureOverrides: true } });
  if (!u) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ overrides: (u.featureOverrides ?? {}) as Record<string, string> });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "SuperAdmin only" }, { status: 403 });
  const { id } = await params;
  let body: { overrides?: Record<string, string> };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // Keep only valid feature keys with a concrete state ("inherit"/anything else → drop).
  const cleaned: Record<string, string> = {};
  for (const [k, v] of Object.entries(body.overrides ?? {})) {
    if (FEATURE_KEYS.includes(k) && STATES.has(v)) cleaned[k] = v;
  }
  const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Prisma 7 omits JSON fields from model update inputs → raw SQL.
  await pgPool.query('UPDATE "User" SET "featureOverrides" = $1::jsonb WHERE id = $2', [JSON.stringify(cleaned), id]);
  return NextResponse.json({ ok: true, overrides: cleaned });
}
