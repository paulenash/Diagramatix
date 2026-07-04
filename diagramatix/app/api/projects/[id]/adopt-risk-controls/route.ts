import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { loadLibraryDTO } from "@/app/lib/riskControls/queries";
import { adoptLibrary, AdoptLibraryError } from "@/app/lib/riskControls/adoptLibrary";

type Params = { params: Promise<{ id: string }> };

/** GET — the org-master Risk & Control libraries this project could adopt.
 *  Gated at "view" so the project UI can populate its dropdown. */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "view", false); if (g.error) return g.error;
  const [org, libraries] = await Promise.all([
    prisma.org.findUnique({ where: { id: g.ctx.projectOrgId }, select: { id: true, name: true } }),
    prisma.riskControlLibrary.findMany({
      where: { orgId: g.ctx.projectOrgId }, orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { items: true } } },
    }),
  ]);
  return NextResponse.json({
    orgId: org?.id, orgName: org?.name ?? "",
    libraries: libraries.map((l) => ({ id: l.id, name: l.name, itemCount: l._count.items })),
  });
}

/** POST { orgLibraryId }[?replace=true] — clone an org master into a project copy. */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  const orgLibraryId = (await req.json().catch(() => ({})))?.orgLibraryId;
  if (typeof orgLibraryId !== "string" || !orgLibraryId) return NextResponse.json({ error: "orgLibraryId required" }, { status: 400 });
  const replace = new URL(req.url).searchParams.get("replace") === "true";
  try {
    const created = await adoptLibrary(id, g.ctx.projectOrgId, orgLibraryId, { replace });
    return NextResponse.json({ library: await loadLibraryDTO(created.libraryId) }, { status: 201 });
  } catch (err) {
    if (err instanceof AdoptLibraryError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
