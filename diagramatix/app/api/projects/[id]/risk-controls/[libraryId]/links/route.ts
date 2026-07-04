import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { hLink, hUnlink } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string }> };

/** POST { controlId, riskId } — link a Control to a Risk (owner). */
export async function POST(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hLink(libraryId, { projectId: id }, await req.json().catch(() => ({})));
}

/** DELETE { controlId, riskId } — remove a mitigation link (owner). */
export async function DELETE(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hUnlink(libraryId, { projectId: id }, await req.json().catch(() => ({})));
}
