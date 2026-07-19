/**
 * SuperAdmin Image Library — GET the whole HelpImage library with a usage summary
 * (how many references, split by document collection). Upload is POST /api/help/images
 * (reused); delete is DELETE /api/help/images/[id] (reused).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { computeImageUsages } from "@/app/lib/help/imageUsage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [images, usages] = await Promise.all([
    prisma.helpImage.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, filename: true, screenName: true, diagramName: true, alt: true, width: true, height: true, createdAt: true },
    }),
    computeImageUsages(),
  ]);

  const out = images.map((i) => {
    const u = usages.get(i.id) ?? [];
    const byCollection: Record<string, number> = {};
    for (const x of u) byCollection[x.collection] = (byCollection[x.collection] ?? 0) + 1;
    return { ...i, url: `/api/help/images/${i.id}`, refCount: u.length, byCollection };
  });

  return NextResponse.json({ images: out });
}
