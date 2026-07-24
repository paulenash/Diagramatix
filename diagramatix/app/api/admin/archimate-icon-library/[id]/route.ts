/**
 * One ArchiMate library icon.
 *   GET    → the icon (any signed-in user).
 *   PUT    → update name/category/primitives/size (SuperAdmin); optional new source image.
 *   DELETE → remove it (SuperAdmin) + clear any element assignments pointing at it.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { isAllowedImage, ALLOWED_IMAGE_LABEL } from "@/app/lib/help/imageFormats";
import { validateIconPrimitives, type IconPrimitive } from "@/app/lib/archimate/iconShapes";
import { ARCHIMATE_ICON_CUSTOM_KEY, type CustomIconAssignments } from "@/app/lib/archimate/customIcon";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const r = await prisma.archimateIconLibrary.findUnique({
    where: { id },
    select: { id: true, name: true, category: true, primitives: true, defaultWidth: true, defaultHeight: true, sourceMime: true },
  });
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let primitives: IconPrimitive[] = [];
  try { primitives = validateIconPrimitives(JSON.parse(r.primitives)); } catch { primitives = []; }
  return NextResponse.json({ icon: { id: r.id, name: r.name, category: r.category, primitives, defaultWidth: r.defaultWidth, defaultHeight: r.defaultHeight, hasSource: !!r.sourceMime } });
}

const intField = (form: FormData, k: string): number | null => {
  const v = form.get(k);
  const n = v != null ? parseInt(String(v), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });

  const name = (form.get("name") as string | null)?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const category = (form.get("category") as string | null)?.trim() || null;

  let primitives: unknown;
  try { primitives = JSON.parse((form.get("primitives") as string) ?? "[]"); }
  catch { return NextResponse.json({ error: "primitives must be JSON" }, { status: 400 }); }
  const clean = validateIconPrimitives(primitives);

  const data: Record<string, unknown> = {
    name, category,
    primitives: JSON.stringify(clean),
    defaultWidth: intField(form, "defaultWidth"),
    defaultHeight: intField(form, "defaultHeight"),
  };

  const file = form.get("file");
  if (file instanceof Blob && file.size > 0) {
    if (file.size > 8_000_000) return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 413 });
    if (!isAllowedImage(file.type, "icon")) return NextResponse.json({ error: `Unsupported image format. Allowed: ${ALLOWED_IMAGE_LABEL}.` }, { status: 415 });
    data.sourceBytes = Buffer.from(await file.arrayBuffer());
    data.sourceMime = file.type || "image/png";
  }

  await prisma.archimateIconLibrary.update({ where: { id }, data: data as never }).catch(() => null);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;

  await prisma.archimateIconLibrary.delete({ where: { id } }).catch(() => { /* already gone */ });

  // Drop any element assignments that pointed at this icon so no stale mapping remains.
  const row = await prisma.appSetting.findUnique({ where: { key: ARCHIMATE_ICON_CUSTOM_KEY } });
  if (row?.value) {
    let map: CustomIconAssignments = {};
    try { map = JSON.parse(row.value); } catch { map = {}; }
    let changed = false;
    for (const [k, v] of Object.entries(map)) if (v === id) { delete map[k]; changed = true; }
    if (changed) {
      await prisma.appSetting.update({ where: { key: ARCHIMATE_ICON_CUSTOM_KEY }, data: { value: JSON.stringify(map) } });
    }
  }
  return NextResponse.json({ ok: true });
}
