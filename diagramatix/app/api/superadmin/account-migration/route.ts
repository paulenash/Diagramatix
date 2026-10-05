import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { recordAudit, auditActor } from "@/app/lib/audit";
import { countReferences, describeCounts, migrationSettingKey, moveReferences, oldAddressFor } from "@/app/lib/superAdminMigration";

/**
 * The one-time move of a new-address SuperAdmin's data from their old address's account (Paul, 2026-10-05).
 * GET  — what would move, and whether it has already been done.
 * POST — { confirm: true } does it, once; recorded so it never asks again.
 * Keyed on the REAL signed-in user, never on an impersonated one.
 */
async function context() {
  const session = await auth();
  const me = session?.user;
  if (!me?.id || !me.email) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  const oldEmail = oldAddressFor(me.email);
  if (!oldEmail || !isSuperuser(session)) return { error: NextResponse.json({ eligible: false }) } as const;
  return { session, me: { id: me.id, email: me.email }, oldEmail } as const;
}

export async function GET() {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const [done, old, mine] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: migrationSettingKey(ctx.me.id) } }),
    prisma.user.findUnique({ where: { email: ctx.oldEmail }, select: { id: true } }),
    prisma.user.findUnique({ where: { id: ctx.me.id }, select: { name: true } }),
  ]);
  const refs = !done && old ? await countReferences(old.id) : [];
  return NextResponse.json({
    eligible: true,
    name: mine?.name ?? null,
    oldEmail: ctx.oldEmail,
    done: !!done,
    oldFound: !!old,
    pending: !done && !!old && refs.length > 0,
    summary: describeCounts(refs),
    counts: refs,
  });
}

export async function POST(req: Request) {
  const ctx = await context();
  if ("error" in ctx) return ctx.error;
  const blocked = await blockReadOnlyImpersonation(ctx.session);
  if (blocked) return blocked;
  const body = (await req.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) return NextResponse.json({ error: "Confirmation required" }, { status: 400 });

  const key = migrationSettingKey(ctx.me.id);
  if (await prisma.appSetting.findUnique({ where: { key } })) return NextResponse.json({ ok: true, alreadyDone: true });
  const old = await prisma.user.findUnique({ where: { email: ctx.oldEmail }, select: { id: true } });
  if (!old) return NextResponse.json({ error: "The old account was not found" }, { status: 404 });
  if (old.id === ctx.me.id) return NextResponse.json({ error: "Old and new accounts are the same" }, { status: 400 });

  const result = await moveReferences(old.id, ctx.me.id);
  await prisma.appSetting.upsert({
    where: { key },
    create: { key, value: JSON.stringify({ from: ctx.oldEmail, at: new Date().toISOString(), moved: result.moved, skipped: result.skipped }) },
    update: { value: JSON.stringify({ from: ctx.oldEmail, at: new Date().toISOString(), moved: result.moved, skipped: result.skipped }) },
  });
  await recordAudit({
    ...auditActor(ctx.session, req),
    action: "superadmin.account-migration",
    targetType: "user",
    targetId: ctx.me.id,
    meta: { from: ctx.oldEmail, moved: result.moved, skipped: result.skipped },
  });
  return NextResponse.json({ ok: true, moved: describeCounts(result.moved), skipped: describeCounts(result.skipped) });
}
