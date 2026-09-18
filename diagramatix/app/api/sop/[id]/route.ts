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
import { blockReadOnlyImpersonation } from "@/app/lib/routeGuard";

async function loadProjectId(sopId: string): Promise<string | null> {
  const doc = await prisma.sopDocument.findUnique({ where: { id: sopId }, select: { projectId: true } });
  return doc?.projectId ?? null;
}

async function guard(sopId: string, role: "view" | "edit") {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  // SEC-34: a SuperAdmin viewing this user's account in read-only mode must not
  // be able to rewrite or delete their SOPs — the write would be attributed to
  // the user being viewed. Blocked before any lookup, as the write routes do.
  if (role === "edit") {
    const ro = await blockReadOnlyImpersonation(session);
    if (ro) return { error: ro };
  }
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
  const clientVersion = typeof body.version === "number" ? body.version : null;

  // DATA-36: a save with sections DELETES every section and recreates them, so
  // two people editing one SOP would have the second wholesale destroy the
  // first's work — and get a 200 for it. Same contract the diagram save has:
  // send the version you loaded, and a 409 comes back with the current document
  // if it has moved on. A save that only touches the title or the status leaves
  // the sections alone and needs no token.
  if (sections && clientVersion === null) {
    return NextResponse.json({
      error: "version-required",
      message: "Send the version you loaded so a concurrent edit is not overwritten.",
    }, { status: 400 });
  }

  let conflict = false;
  await prisma.$transaction(async (tx) => {
    if (sections) {
      // The compare-and-swap IS the version bump: it only affects a row still at
      // the version this editor loaded, so losing the race writes nothing.
      const cas = await tx.sopDocument.updateMany({
        where: { id, version: clientVersion! },
        data: {
          ...(title !== undefined ? { title } : {}),
          ...(status !== undefined ? { status } : {}),
          version: { increment: 1 },
        },
      });
      if (cas.count === 0) { conflict = true; return; }
    } else if (title !== undefined || status !== undefined) {
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
          // Round-trip the section identity so regenerate can merge. aiBodyHash is
          // preserved verbatim (reflects the AI's last output) so editing the body
          // is detected on regenerate; `key` ties it to a template section; `locked`
          // is the author's "keep on regenerate" pin.
          key: typeof s.key === "string" ? s.key : null,
          aiBodyHash: typeof s.aiBodyHash === "string" ? s.aiBodyHash : null,
          locked: s.locked === true,
          sortOrder: i,
        })),
      });
    }
  });

  if (conflict) {
    // Hand back what is actually there, so the editor can show the other version
    // rather than just refusing. Mirrors the diagram route's 409 body.
    const current = await prisma.sopDocument.findUnique({
      where: { id },
      include: { sections: { orderBy: { sortOrder: "asc" } } },
    });
    return NextResponse.json({
      error: "conflict",
      message: "Someone else saved this SOP while you were editing it.",
      currentVersion: current?.version ?? null,
      document: current,
    }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(id, "edit");
  if (g.error) return g.error;
  await prisma.sopDocument.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
