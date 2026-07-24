/**
 * Which ArchiMate elements ALSO surface a separate icon-only palette entry.
 *   GET → { names }  (any signed-in user; drives the Symbols Panel)
 *   PUT → { names }   (SuperAdmin) — the full list of element names.
 * Stored as a JSON string in AppSetting["archimate.icon.separate"]; unset = default.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { ARCHIMATE_SEPARATE_ICON_KEY, DEFAULT_SEPARATE_ICONS } from "@/app/lib/archimate/paletteRows";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ARCHIMATE_SEPARATE_ICON_KEY } });
    const names = row?.value ? (JSON.parse(row.value) as unknown) : null;
    return NextResponse.json({ names: Array.isArray(names) ? names.filter((n) => typeof n === "string") : DEFAULT_SEPARATE_ICONS });
  } catch {
    return NextResponse.json({ names: DEFAULT_SEPARATE_ICONS });
  }
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const raw = body?.names;
  if (!Array.isArray(raw)) return NextResponse.json({ error: "names array required" }, { status: 400 });
  const names = [...new Set(raw.filter((n): n is string => typeof n === "string" && !!n.trim()))];
  const value = JSON.stringify(names);
  await prisma.appSetting.upsert({
    where: { key: ARCHIMATE_SEPARATE_ICON_KEY },
    create: { key: ARCHIMATE_SEPARATE_ICON_KEY, value },
    update: { value },
  });
  return NextResponse.json({ names });
}
