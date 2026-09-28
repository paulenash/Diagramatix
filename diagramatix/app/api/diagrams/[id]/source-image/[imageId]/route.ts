/**
 * GET /api/diagrams/[id]/source-image/[imageId] — the image this diagram was
 * generated from (Paul, 2026-09-28: "I need a way to view the image after the
 * diagram has been generated").
 *
 * An image is only ever reached THROUGH a diagram the caller can view, and only
 * when it is that diagram's image:
 *   - VIEW access to the diagram;
 *   - the image belongs to the diagram's organisation — diagram data is
 *     editable, so an id written into it must never reach another org's image;
 *   - and it is the image the saved diagram names (data.aiGeneration.sourceImage)
 *     — or the caller stored it themselves, which covers the moments after a
 *     generation before the diagram's autosave has landed.
 * Anything else is a 404, with no hint of whether such an image exists.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { SOURCE_IMAGE_TYPES } from "@/app/lib/ai/sourceImage";

type Params = { params: Promise<{ id: string; imageId: string }> };

const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, imageId } = await params;
  const cookieStore = await cookies();
  try {
    await requireDiagramAccess(session, cookieStore, id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const diagram = await prisma.diagram.findUnique({ where: { id }, select: { orgId: true, data: true } });
  if (!diagram) return notFound();
  const img = await prisma.aiSourceImage.findFirst({
    where: { id: imageId, orgId: diagram.orgId },
    select: { bytes: true, mimeType: true, name: true, createdById: true },
  });
  if (!img) return notFound();
  const gen = ((diagram.data as Record<string, unknown> | null)?.aiGeneration ?? null) as { sourceImage?: { id?: unknown } } | null;
  const named = gen?.sourceImage?.id === imageId;
  const mine = !!img.createdById && img.createdById === getEffectiveUserId(session, cookieStore);
  if (!named && !mine) return notFound();

  const type = SOURCE_IMAGE_TYPES.includes(img.mimeType) ? img.mimeType : "application/octet-stream";
  return new NextResponse(new Uint8Array(img.bytes as Buffer), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `inline; filename="${img.name.replace(/[^\w.\- ]+/g, "_")}"`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
