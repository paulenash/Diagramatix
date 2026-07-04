import { NextResponse } from "next/server";
import { guardOrg } from "@/app/lib/riskControls/routeAuth";
import { loadLibraryDTO } from "@/app/lib/riskControls/queries";
import { hRenameLibrary, hDeleteLibrary } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string }> };

/** GET a single org library (with items + links). */
export async function GET(_req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardOrg(id, false); if (g.error) return g.error;
  const library = await loadLibraryDTO(libraryId);
  if (!library || library.orgId !== id) return NextResponse.json({ error: "Library not found" }, { status: 404 });
  return NextResponse.json({ library });
}

/** PUT { name } — rename. */
export async function PUT(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  return hRenameLibrary(libraryId, { orgId: id }, await req.json().catch(() => ({})));
}

/** DELETE — remove the library (cascades items + links). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  return hDeleteLibrary(libraryId, { orgId: id });
}
