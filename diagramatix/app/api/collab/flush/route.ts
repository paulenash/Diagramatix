/**
 * Hard-flush a co-authoring room when a joint session ends.
 *
 * Co-authoring is presence-only (no Liveblocks Storage), but an ABRUPT tab close
 * can leave a "zombie" connection lingering server-side whose stale presence
 * (old ghost connectors/labels) gets replayed to whoever joins next. On leave,
 * each client beacons here and we DELETE the whole room — since there's no
 * Storage to lose, this simply drops every connection (zombies included) and the
 * next join auto-recreates a clean room. Any live participant is briefly
 * disconnected and auto-reconnects into the fresh room.
 *
 * Always 204s (fire-and-forget from sendBeacon): unconfigured, no access, or a
 * Liveblocks error must never surface as a client error on unload.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireDiagramAccess } from "@/app/lib/auth/orgContext";

export async function POST(req: Request) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) return new NextResponse(null, { status: 204 });

  try {
    const session = await auth();
    if (!session?.user?.id) return new NextResponse(null, { status: 204 });

    // sendBeacon delivers a text/plain-ish body; parse leniently.
    const raw = await req.text().catch(() => "");
    let diagramId = "";
    try { diagramId = (JSON.parse(raw || "{}") as { diagramId?: string }).diagramId ?? ""; } catch { /* ignore */ }
    if (!diagramId) return new NextResponse(null, { status: 204 });

    // Only someone with access to the diagram may flush its room.
    await requireDiagramAccess(session, await cookies(), diagramId, "view");

    const { Liveblocks } = await import("@liveblocks/node");
    const lb = new Liveblocks({ secret });
    await lb.deleteRoom(`diagram:${diagramId}`);
  } catch { /* fire-and-forget — never error on unload */ }

  return new NextResponse(null, { status: 204 });
}
