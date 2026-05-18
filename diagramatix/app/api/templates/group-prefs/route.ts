/**
 * Per-user template-group collapse state.
 *
 *   GET  → { prefs: Record<string, boolean> }
 *   PUT  body: { key: string, collapsed: boolean }
 *
 * Keys are `"<scope>:<group-name>"` where scope is `"user"` or `"builtin"`,
 * matching the editor menu's separate User Templates / Built-In Templates
 * sections. `true` = collapsed; entries default to `false` (expanded) when
 * absent. We persist into `User.templateGroupPrefs` (Json) — a single
 * column carries the whole map so adding / removing groups never needs a
 * schema change.
 *
 * Impersonation is read-only: viewing another user shows their saved
 * collapse state but PUTs are rejected.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";

function readPrefs(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback */ }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { templateGroupPrefs: true },
  });
  return NextResponse.json({ prefs: readPrefs(user?.templateGroupPrefs ?? null) });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    if (isReadOnlyImpersonation(session, await cookies())) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* proceed */ }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (body ?? {}) as { key?: unknown; collapsed?: unknown };
  if (typeof b.key !== "string" || !b.key.trim()
      || typeof b.collapsed !== "boolean") {
    return NextResponse.json({ error: "key (string) and collapsed (boolean) required" }, { status: 400 });
  }

  // Read-merge-write — keeps unrelated keys intact when only one group's
  // state changes.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { templateGroupPrefs: true },
  });
  const prefs = readPrefs(user?.templateGroupPrefs ?? null);
  prefs[b.key.trim()] = b.collapsed;

  await prisma.user.update({
    where: { id: session.user.id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: { templateGroupPrefs: prefs as any },
  });
  return NextResponse.json({ prefs });
}
