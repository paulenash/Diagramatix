import { guardOrg } from "@/app/lib/riskControls/routeAuth";
import { hUpdateItem, hDeleteItem } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string; itemId: string }> };

/** PUT — update a Risk/Control item. */
export async function PUT(req: Request, { params }: Params) {
  const { id, libraryId, itemId } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  return hUpdateItem(libraryId, itemId, { orgId: id }, await req.json().catch(() => ({})));
}

/** DELETE — remove an item (cascades its mitigation links). */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, libraryId, itemId } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  return hDeleteItem(libraryId, itemId, { orgId: id });
}
