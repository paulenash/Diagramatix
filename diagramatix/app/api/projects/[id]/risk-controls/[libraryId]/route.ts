import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { hRenameLibrary, hDeleteLibrary } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string }> };

/** PUT { name } — rename the project library (owner). */
export async function PUT(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hRenameLibrary(libraryId, { projectId: id }, await req.json().catch(() => ({})));
}

/** DELETE — remove the project library (owner). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hDeleteLibrary(libraryId, { projectId: id });
}
