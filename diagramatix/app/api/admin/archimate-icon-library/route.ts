/**
 * ArchiMate Icon Library.
 *   GET  → list icons (any signed-in user; primitives are non-sensitive geometry).
 *   POST → create an icon (SuperAdmin). multipart: name, category?, primitives(JSON),
 *          defaultWidth?, defaultHeight?, file? (source image kept as editing underlay).
 * Bytes live in the DB (container public/ is read-only), like HelpImage.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { isAllowedImage, ALLOWED_IMAGE_LABEL } from "@/app/lib/help/imageFormats";
import { validateIconPrimitives } from "@/app/lib/archimate/iconShapes";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.archimateIconLibrary.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, category: true, primitives: true, defaultWidth: true, defaultHeight: true, sourceMime: true, createdAt: true },
  });
  const icons = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    primitives: safeParse(r.primitives),
    defaultWidth: r.defaultWidth,
    defaultHeight: r.defaultHeight,
    hasSource: !!r.sourceMime,
    createdAt: r.createdAt,
  }));
  return NextResponse.json({ icons });
}

function safeParse(s: string) {
  try { return validateIconPrimitives(JSON.parse(s)); } catch { return []; }
}

const intField = (form: FormData, k: string): number | null => {
  const v = form.get(k);
  const n = v != null ? parseInt(String(v), 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });

  const name = (form.get("name") as string | null)?.trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const category = (form.get("category") as string | null)?.trim() || null;

  let primitives: unknown;
  try { primitives = JSON.parse((form.get("primitives") as string) ?? "[]"); }
  catch { return NextResponse.json({ error: "primitives must be JSON" }, { status: 400 }); }
  const clean = validateIconPrimitives(primitives);

  const file = form.get("file");
  let sourceBytes: Uint8Array<ArrayBuffer> | null = null;
  let sourceMime: string | null = null;
  if (file instanceof Blob && file.size > 0) {
    if (file.size > 8_000_000) return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 413 });
    if (!isAllowedImage(file.type, "icon")) return NextResponse.json({ error: `Unsupported image format. Allowed: ${ALLOWED_IMAGE_LABEL}.` }, { status: 415 });
    sourceBytes = new Uint8Array(await file.arrayBuffer());
    sourceMime = file.type || "image/png";
  }

  const created = await prisma.archimateIconLibrary.create({
    data: {
      name, category,
      primitives: JSON.stringify(clean),
      defaultWidth: intField(form, "defaultWidth"),
      defaultHeight: intField(form, "defaultHeight"),
      sourceBytes, sourceMime,
      createdById: session!.user!.id,
    },
    select: { id: true },
  });
  return NextResponse.json({ id: created.id });
}
