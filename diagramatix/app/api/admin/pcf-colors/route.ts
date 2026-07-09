/**
 * SuperAdmin: read / set the APQC PCF hierarchy level colour scheme (persisted
 * in AppSetting). Each level carries a main colour + a lightness % for its
 * derived light tone; the two-tone pair and text-contrast are computed from
 * those. GET is open to any signed-in user (the scheme is needed to render the
 * hierarchy); PUT is SuperAdmin-only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { PCF_LEVEL_NAMES, DEFAULT_PCF_LEVEL_COLORS } from "@/app/lib/pcf/levelColors";
import { getPcfLevelColors, setPcfLevelColors } from "@/app/lib/pcf/levelColorsSetting";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ colors: await getPcfLevelColors(), names: PCF_LEVEL_NAMES });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const colors = await setPcfLevelColors(body?.colors);
  return NextResponse.json({ colors });
}

export async function DELETE() {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  // Reset to built-in defaults.
  const colors = await setPcfLevelColors(DEFAULT_PCF_LEVEL_COLORS);
  return NextResponse.json({ colors });
}
