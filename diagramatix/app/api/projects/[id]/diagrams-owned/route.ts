import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/[id]/diagrams-owned
//
// Returns every diagram in the project where the caller is the
// `diagramOwnerId`. Powers the multi-root picker in PublishBundleDialog
// (only diagrams you own can be bundle roots — CPS 230 accountability
// rule, same as per-diagram publishing).
//
// Includes lifecycle + current version metadata so the picker can show
// "Draft" / "Published v3" chips next to each option.
//
// Gate: any project access (view, edit, owner). The caller already has
// to be in the project to be looking at this page; the diagramOwnerId
// filter does the actual restriction.
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await requireProjectAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const diagrams = await prisma.diagram.findMany({
    where: { projectId: id, diagramOwnerId: session.user.id },
    select: {
      id: true,
      name: true,
      type: true,
      lifecycle: true,
      currentPublishedVersion: { select: { versionNumber: true, publishedAt: true } },
    },
    orderBy: [{ name: "asc" }],
  });

  return NextResponse.json({
    diagrams: diagrams.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      lifecycle: d.lifecycle,
      currentVersion: d.currentPublishedVersion
        ? { versionNumber: d.currentPublishedVersion.versionNumber, publishedAt: d.currentPublishedVersion.publishedAt.toISOString() }
        : null,
    })),
  });
}
