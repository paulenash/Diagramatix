/**
 * Global Bubble Help master switch.
 *   GET  /api/bubble-helps/global  → { enabled } (any signed-in user may read)
 *   PUT  /api/bubble-helps/global  → set { enabled } (SuperAdmin only)
 *
 * Default is OFF everywhere; only a SuperAdmin can turn Bubble Help back on.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { getBubbleHelpEnabled, setBubbleHelpEnabled } from "@/app/lib/bubbleHelpSetting";

export async function GET() {
  return NextResponse.json({ enabled: await getBubbleHelpEnabled() });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  let body: { enabled?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  if (typeof body.enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  await setBubbleHelpEnabled(body.enabled);
  return NextResponse.json({ enabled: body.enabled });
}
