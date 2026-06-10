import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

type Params = { params: Promise<{ id: string }> };

// POST /api/bundles/[id]/archive — stamp `supersededAt` on the bundle,
// revoking the audience grants. Idempotent — re-calling is a no-op.
//
// Gate: caller must be the bundle's publishedById. Project ownership
// alone is not sufficient (mirrors the publish gate).
export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id } = await params;

  const bundle = await prisma.publicationBundle.findUnique({
    where: { id },
    select: { publishedById: true, supersededAt: true },
  });
  if (!bundle) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (bundle.publishedById !== userId) {
    return NextResponse.json({ error: "Only the bundle author can archive it" }, { status: 403 });
  }
  if (bundle.supersededAt) {
    return NextResponse.json({ ok: true, alreadyArchived: true });
  }

  await prisma.publicationBundle.update({
    where: { id },
    data: { supersededAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
