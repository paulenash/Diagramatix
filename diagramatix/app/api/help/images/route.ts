/**
 * Help-image library (captured screenshots for the User Guide).
 *   GET  → list metadata (SuperAdmin) for the editor's image picker.
 *   POST → store a captured PNG (multipart: file + screenName + diagramName? + alt? + …).
 * Bytes live in the DB because the container's public/ is read-only at runtime.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { isAllowedImage, ALLOWED_IMAGE_LABEL } from "@/app/lib/help/imageFormats";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const images = await prisma.helpImage.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, filename: true, screenName: true, diagramName: true, alt: true, width: true, height: true, createdAt: true },
  });
  return NextResponse.json({ images: images.map((i) => ({ ...i, url: `/api/help/images/${i.id}` })) });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (file.size > 8_000_000) return NextResponse.json({ error: "Image too large (max 8 MB)" }, { status: 413 });

  const str = (k: string) => { const v = form.get(k); return typeof v === "string" && v.trim() ? v.trim() : null; };
  const num = (k: string) => { const v = form.get(k); const n = v ? parseInt(String(v), 10) : NaN; return Number.isFinite(n) ? n : null; };
  const screenName = str("screenName") || "Screen";
  const filename = str("filename") || `${screenName}.png`;

  // Only browser-displayable image formats (so a stored image never shows broken).
  if (!isAllowedImage(file.type, filename)) {
    return NextResponse.json(
      { error: `Unsupported image format. Allowed: ${ALLOWED_IMAGE_LABEL}.` },
      { status: 415 },
    );
  }

  const created = await prisma.helpImage.create({
    data: {
      filename,
      screenName,
      diagramName: str("diagramName"),
      alt: str("alt"),
      mimeType: file.type || "image/png",
      bytes: Buffer.from(await file.arrayBuffer()),
      width: num("width"),
      height: num("height"),
      createdById: session.user.id,
    },
    select: { id: true, filename: true },
  });
  return NextResponse.json({ id: created.id, filename: created.filename, url: `/api/help/images/${created.id}` });
}
