import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { hCreateItem } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string }> };

/** POST — create a Risk or Control item in the project library (owner). */
export async function POST(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hCreateItem(libraryId, { projectId: id }, await req.json().catch(() => ({})));
}
