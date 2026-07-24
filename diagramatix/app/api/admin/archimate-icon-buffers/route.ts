/**
 * Per-category glyph edge buffers.
 *   GET → { buffers }  (any signed-in user; non-sensitive geometry)
 *   PUT → { buffers }   (SuperAdmin) — Record<category, {top?, right?}>
 * Stored as a JSON string in AppSetting["archimate.icon.buffer"].
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { ARCHIMATE_ICON_BUFFER_KEY, type CategoryBuffers } from "@/app/lib/archimate/iconLayout";

async function read(): Promise<CategoryBuffers> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ARCHIMATE_ICON_BUFFER_KEY } });
    return row?.value ? (JSON.parse(row.value) as CategoryBuffers) : {};
  } catch { return {}; }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ buffers: await read() });
}

const NUM = (v: unknown) => (typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : undefined);

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const raw = body?.buffers;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "buffers object required" }, { status: 400 });

  const clean: CategoryBuffers = {};
  for (const [cat, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const entry: { top?: number; right?: number } = {};
    const top = NUM(o.top), right = NUM(o.right);
    if (top !== undefined) entry.top = top;
    if (right !== undefined) entry.right = right;
    if (Object.keys(entry).length) clean[cat] = entry;
  }

  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({
    where: { key: ARCHIMATE_ICON_BUFFER_KEY },
    create: { key: ARCHIMATE_ICON_BUFFER_KEY, value },
    update: { value },
  });
  return NextResponse.json({ buffers: clean });
}
