import { guardProject } from "@/app/lib/riskControls/routeAuth";
import { hUpdateItem, hDeleteItem } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string; itemId: string }> };

/** PUT — update a Risk/Control item (owner). */
export async function PUT(req: Request, { params }: Params) {
  const { id, libraryId, itemId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hUpdateItem(libraryId, itemId, { projectId: id }, await req.json().catch(() => ({})));
}

/** DELETE — remove an item (owner). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, libraryId, itemId } = await params;
  const g = await guardProject(id, "owner", true); if (g.error) return g.error;
  return hDeleteItem(libraryId, itemId, { projectId: id });
}
