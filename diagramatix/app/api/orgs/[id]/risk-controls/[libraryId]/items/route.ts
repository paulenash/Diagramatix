import { guardOrg } from "@/app/lib/riskControls/routeAuth";
import { hCreateItem } from "@/app/lib/riskControls/handlers";

type Params = { params: Promise<{ id: string; libraryId: string }> };

/** POST — create a Risk or Control item in an org library. */
export async function POST(req: Request, { params }: Params) {
  const { id, libraryId } = await params;
  const g = await guardOrg(id, true); if (g.error) return g.error;
  return hCreateItem(libraryId, { orgId: id }, await req.json().catch(() => ({})));
}
