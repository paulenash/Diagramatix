/**
 * SuperAdmin: read / set the app-wide Feature Colours scheme (persisted in
 * AppSetting). GET is open to any signed-in user (the scheme is needed to render
 * menus / tiles / the drift ring); PUT + DELETE are SuperAdmin-only. DELETE resets
 * to the built-in defaults.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { DEFAULT_FEATURE_SCHEME } from "@/app/lib/theme/featureColors";
import { getFeatureColors, setFeatureColors } from "@/app/lib/theme/featureColorsSetting";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ scheme: await getFeatureColors() });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const scheme = await setFeatureColors(body?.scheme);
  return NextResponse.json({ scheme });
}

export async function DELETE() {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const scheme = await setFeatureColors(DEFAULT_FEATURE_SCHEME);
  return NextResponse.json({ scheme });
}
