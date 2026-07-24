/**
 * ArchiMate icon-layout overrides API.
 *
 *   GET  /api/admin/archimate-icons  → { overrides }  (any signed-in user; the
 *        overrides are non-sensitive rendering geometry used across the app).
 *   PUT  /api/admin/archimate-icons  { overrides }    → saves. SuperAdmin only.
 *
 * Stored as a JSON string in AppSetting["archimate.icon.layout"].
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { ARCHIMATE_ICON_LAYOUT_KEY, type IconLayoutOverrides } from "@/app/lib/archimate/iconLayout";

async function readOverrides(): Promise<IconLayoutOverrides> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ARCHIMATE_ICON_LAYOUT_KEY } });
    return row?.value ? (JSON.parse(row.value) as IconLayoutOverrides) : {};
  } catch {
    return {};
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ overrides: await readOverrides() });
}

const NUM = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { overrides?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const raw = body.overrides;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Missing overrides object" }, { status: 400 });

  // Sanitise: keep only known numeric fields per iconType; drop empty entries so
  // an icon reset to defaults leaves no dead override.
  const clean: IconLayoutOverrides = {};
  for (const [iconType, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as Record<string, unknown>;
    const entry: Record<string, number> = {};
    for (const k of ["xOffset", "yOffset", "width", "height"]) {
      const n = NUM(o[k]);
      if (n !== undefined) entry[k] = Math.round(n * 100) / 100;
    }
    if (Object.keys(entry).length) clean[iconType] = entry;
  }

  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({
    where: { key: ARCHIMATE_ICON_LAYOUT_KEY },
    create: { key: ARCHIMATE_ICON_LAYOUT_KEY, value },
    update: { value },
  });
  return NextResponse.json({ overrides: clean });
}
