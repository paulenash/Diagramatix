/**
 * Rich-text dictation command catalogue. GET returns the effective command list
 * (DB overrides merged onto the built-in defaults) for the editor's mic; PUT
 * (SuperAdmin) saves edited phrases. Phrases are a Postgres text[] — no JSON
 * quirk — so plain Prisma model access is fine.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { DEFAULT_DICTATION_COMMANDS } from "@/app/lib/dictation/commands";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let overrides = new Map<string, string[]>();
  try {
    const rows = await prisma.dictationCommand.findMany();
    overrides = new Map(rows.map((r) => [r.action, r.phrases]));
  } catch { /* table may not exist yet on first deploy — fall back to defaults */ }

  const commands = DEFAULT_DICTATION_COMMANDS.map((d) => ({
    action: d.action,
    phrases: overrides.get(d.action) ?? d.phrases,
    positional: !!d.positional,
  }));
  return NextResponse.json({ commands });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const commands = Array.isArray(body.commands) ? body.commands : [];
  const valid = new Set(DEFAULT_DICTATION_COMMANDS.map((d) => d.action));
  for (const c of commands) {
    if (typeof c?.action !== "string" || !valid.has(c.action)) continue;
    const phrases: string[] = Array.isArray(c.phrases)
      ? Array.from(new Set(c.phrases.map((p: unknown) => String(p).trim().toLowerCase()).filter(Boolean) as string[]))
      : [];
    await prisma.dictationCommand.upsert({
      where: { action: c.action },
      create: { action: c.action, phrases },
      update: { phrases },
    });
  }
  return NextResponse.json({ ok: true });
}
