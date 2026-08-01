/**
 * A single SOP document.
 *   GET    /api/sop/:id  → the document + ordered sections
 *   PUT    /api/sop/:id  → save { title?, status?, sections:[{heading,bodyMarkdown,image?,imageCaption?}] }
 *   DELETE /api/sop/:id
 * Access is the SOP's project access (view for GET, edit for PUT/DELETE).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

async function loadProjectId(sopId: string): Promise<string | null> {
  const doc = await prisma.sopDocument.findUnique({ where: { id: sopId }, select: { projectId: true } });
  return doc?.projectId ?? null;
}

async function guard(sopId: string, role: "view" | "edit") {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const projectId = await loadProjectId(sopId);
  if (!projectId) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  try {
    await requireProjectAccess(session, await cookies(), projectId, role);
  } catch (err) {
    if (err instanceof OrgContextError) return { error: NextResponse.json({ error: err.message }, { status: err.status }) };
    throw err;
  }
  return { session };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, "view");
  if (g.error) return g.error;
  const doc = await prisma.sopDocument.findUnique({
    where: { id },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, "edit");
  if (g.error) return g.error;
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title : undefined;
  const status = body.status === "published" || body.status === "draft" ? body.status : undefined;
  const sections = Array.isArray(body.sections) ? body.sections : null;

  await prisma.$transaction(async (tx) => {
    if (title !== undefined || status !== undefined) {
      await tx.sopDocument.update({ where: { id }, data: { ...(title !== undefined ? { title } : {}), ...(status !== undefined ? { status } : {}) } });
    }
    if (sections) {
      await tx.sopSection.deleteMany({ where: { sopDocumentId: id } });
      await tx.sopSection.createMany({
        data: sections.map((s: Record<string, unknown>, i: number) => ({
          sopDocumentId: id,
          heading: typeof s.heading === "string" ? s.heading : null,
          bodyMarkdown: typeof s.bodyMarkdown === "string" ? s.bodyMarkdown : "",
          image: typeof s.image === "string" ? s.image : null,
          imageCaption: typeof s.imageCaption === "string" ? s.imageCaption : null,
          sortOrder: i,
        })),
      });
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, "edit");
  if (g.error) return g.error;
  await prisma.sopDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
