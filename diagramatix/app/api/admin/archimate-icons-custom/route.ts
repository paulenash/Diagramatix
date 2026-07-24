/**
 * Custom-icon → element assignments.
 *   GET → a denormalised bundle { assignments, icons } (any signed-in user) so a
 *         render surface needs one request. `icons` maps libraryId → {primitives,
 *         defaultWidth, defaultHeight}; assignments are filtered to icons that still exist.
 *   PUT → save the assignment map (SuperAdmin); values must be existing library ids.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { validateIconPrimitives, type IconPrimitive } from "@/app/lib/archimate/iconShapes";
import { ARCHIMATE_ICON_CUSTOM_KEY, type CustomIconAssignments, type CustomIconsById } from "@/app/lib/archimate/customIcon";

async function readAssignments(): Promise<CustomIconAssignments> {
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: ARCHIMATE_ICON_CUSTOM_KEY } });
    return row?.value ? (JSON.parse(row.value) as CustomIconAssignments) : {};
  } catch { return {}; }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const assignmentsRaw = await readAssignments();
  const ids = [...new Set(Object.values(assignmentsRaw))];
  const icons: CustomIconsById = {};
  const assignments: CustomIconAssignments = {};

  if (ids.length) {
    const rows = await prisma.archimateIconLibrary.findMany({
      where: { id: { in: ids } },
      select: { id: true, primitives: true, defaultWidth: true, defaultHeight: true },
    });
    for (const r of rows) {
      let primitives: IconPrimitive[] = [];
      try { primitives = validateIconPrimitives(JSON.parse(r.primitives)); } catch { primitives = []; }
      icons[r.id] = { primitives, defaultWidth: r.defaultWidth, defaultHeight: r.defaultHeight };
    }
    // Keep only assignments whose target icon still exists.
    for (const [k, v] of Object.entries(assignmentsRaw)) if (icons[v]) assignments[k] = v;
  }

  return NextResponse.json({ assignments, icons });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const raw = body?.assignments;
  if (!raw || typeof raw !== "object") return NextResponse.json({ error: "assignments object required" }, { status: 400 });

  // Keep only string→string entries whose target icon exists.
  const wanted = [...new Set(Object.values(raw as Record<string, unknown>).filter((v): v is string => typeof v === "string"))];
  const existing = new Set(
    wanted.length
      ? (await prisma.archimateIconLibrary.findMany({ where: { id: { in: wanted } }, select: { id: true } })).map((r) => r.id)
      : [],
  );
  const clean: CustomIconAssignments = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === "string" && existing.has(v)) clean[k] = v;
  }

  const value = JSON.stringify(clean);
  await prisma.appSetting.upsert({
    where: { key: ARCHIMATE_ICON_CUSTOM_KEY },
    create: { key: ARCHIMATE_ICON_CUSTOM_KEY, value },
    update: { value },
  });
  return NextResponse.json({ assignments: clean });
}
