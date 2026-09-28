/**
 * POST /api/diagrams/[id]/source-image — keep the image an AI generation of
 * this diagram was drawn from (multipart: file, width?, height?).
 *
 * Paul, 2026-09-28: "I need a way to view the image after the diagram has been
 * generated." Stored once per uploader in the organisation (by SHA-256: their
 * re-generate from the same image, or a copy, reuses the row — and another
 * user's identical image is never revealed, neither its existence nor its name);
 * the caller puts the returned id on the diagram (data.aiGeneration.sourceImage).
 * See app/lib/ai/sourceImage.ts.
 *
 * Needs EDIT access to the diagram, and is refused under read-only
 * impersonation. Only the four image types the model reads, up to the
 * consoles' 10 MB, are accepted.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { contentLengthError, uploadSizeError } from "@/app/lib/uploadLimit";
import { MAX_SOURCE_IMAGE_BYTES, SOURCE_IMAGE_TYPES } from "@/app/lib/ai/sourceImage";

type Params = { params: Promise<{ id: string }> };

/** The multipart envelope around the file. */
const ENVELOPE = 64 * 1024;
const SELECT = { id: true, name: true, mimeType: true, width: true, height: true } as const;

const sizeField = (v: FormDataEntryValue | null): number | null => {
  const n = typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100_000 ? Math.round(n) : null;
};

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // A SuperAdmin viewing as someone must not write an image attributed to them.
  const ro = await blockReadOnlyImpersonation(session);
  if (ro) return ro;
  const { id } = await params;
  const cookieStore = await cookies();
  const userId = getEffectiveUserId(session, cookieStore);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let orgId: string;
  try {
    orgId = (await requireDiagramAccess(session, cookieStore, id, "edit")).diagram.orgId;
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  const declared = contentLengthError(req, MAX_SOURCE_IMAGE_BYTES + ENVELOPE);
  if (declared) return NextResponse.json({ error: declared }, { status: 413 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Expected a multipart upload" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  const tooBig = uploadSizeError(file, MAX_SOURCE_IMAGE_BYTES);
  if (tooBig) return NextResponse.json({ error: tooBig }, { status: 413 });
  const mimeType = (file.type || "").toLowerCase();
  if (!SOURCE_IMAGE_TYPES.includes(mimeType)) {
    return NextResponse.json({ error: "Only PNG, JPEG, WebP or GIF images are kept" }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const where = { orgId_createdById_sha256: { orgId, createdById: userId, sha256 } };
  const existing = await prisma.aiSourceImage.findUnique({ where, select: SELECT });
  if (existing) return NextResponse.json(existing);
  try {
    const created = await prisma.aiSourceImage.create({
      data: {
        orgId, sha256, mimeType, bytes,
        name: (file.name || "image").slice(0, 255),
        width: sizeField(form.get("width")),
        height: sizeField(form.get("height")),
        createdById: userId,
      },
      select: SELECT,
    });
    return NextResponse.json(created, { status: 201 });
  } catch {
    // The same image, stored by this user a moment ago (the unique key).
    const again = await prisma.aiSourceImage.findUnique({ where, select: SELECT });
    if (again) return NextResponse.json(again);
    return NextResponse.json({ error: "The image could not be kept" }, { status: 500 });
  }
}
