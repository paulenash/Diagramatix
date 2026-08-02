/**
 * POST /api/sop/:id/undo-regenerate
 * Revert the LAST regenerate: restore the section set captured in
 * `SopDocument.prevSectionsJson` (the safety net), then clear it. One level deep —
 * a second undo is a no-op. Not an AI call (no metering).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

interface PrevSection {
  heading: string | null; bodyMarkdown: string; image: string | null; imageCaption: string | null;
  key: string | null; aiBodyHash: string | null; locked: boolean;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const doc = await prisma.sopDocument.findUnique({ where: { id }, select: { projectId: true, prevSectionsJson: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    await requireProjectAccess(session, await cookies(), doc.projectId, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  if (!doc.prevSectionsJson) return NextResponse.json({ error: "Nothing to undo" }, { status: 400 });

  let prev: PrevSection[];
  try {
    prev = JSON.parse(doc.prevSectionsJson);
    if (!Array.isArray(prev)) throw new Error("bad snapshot");
  } catch {
    return NextResponse.json({ error: "Undo snapshot is unreadable" }, { status: 500 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.sopSection.deleteMany({ where: { sopDocumentId: id } });
    await tx.sopSection.createMany({
      data: prev.map((s, i) => ({
        sopDocumentId: id,
        heading: s.heading ?? null, bodyMarkdown: s.bodyMarkdown ?? "",
        image: s.image ?? null, imageCaption: s.imageCaption ?? null,
        key: s.key ?? null, aiBodyHash: s.aiBodyHash ?? null, locked: s.locked === true, sortOrder: i,
      })),
    });
    await tx.sopDocument.update({ where: { id }, data: { prevSectionsJson: null } });
  });
  return NextResponse.json({ ok: true });
}
