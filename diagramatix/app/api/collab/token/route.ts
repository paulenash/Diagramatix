/**
 * Liveblocks auth endpoint (Phase 2 real-time co-authoring — live cursors).
 *
 * The browser's Liveblocks client POSTs { room } here; we resolve the caller's
 * access to that diagram and mint a scoped Liveblocks access token. Same shape
 * as the Deepgram token route: the secret never leaves the server, the client
 * talks to the SaaS directly. 503 when unconfigured so the app degrades to
 * Phase 1 (polled presence) with no crash.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { requireDiagramAccess, OrgContextError, getCurrentOrgId } from "@/app/lib/auth/orgContext";
import { prisma } from "@/app/lib/db";

const PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5",
];
function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export async function POST(req: Request) {
  const secret = process.env.LIVEBLOCKS_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ error: "Live collaboration is not configured" }, { status: 503 });
  }

  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as { room?: string }));
  const room = typeof body.room === "string" ? body.room : "";
  const diagramId = room.startsWith("diagram:") ? room.slice("diagram:".length) : "";
  if (!diagramId) return NextResponse.json({ error: "Bad room" }, { status: 400 });

  let canWrite = false;
  try {
    const access = await requireDiagramAccess(session, await cookies(), diagramId, "view");
    canWrite = access.role === "owner" || access.role === "edit";
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  // Lazy import so the Liveblocks node SDK isn't pulled into the module graph
  // when collaboration is unconfigured.
  const { Liveblocks } = await import("@liveblocks/node");
  const lb = new Liveblocks({ secret });
  const userId = session.user.id;
  const lbSession = lb.prepareSession(userId, {
    userInfo: { name: session.user.name ?? session.user.email ?? "User", color: colorFor(userId) },
  });
  lbSession.allow(room, canWrite ? lbSession.FULL_ACCESS : lbSession.READ_ACCESS);
  const { status, body: tokenBody } = await lbSession.authorize();
  // Record a unified usage row so Liveblocks shows up as a provider/model in the
  // AI Usage breakdowns + dropdowns (one row per collab room join). Non-fatal.
  if (status < 400) {
    try {
      let orgId: string | null = null;
      try { orgId = await getCurrentOrgId(session, await cookies()); } catch { /* no active org */ }
      await prisma.aiInvocation.create({
        data: { provider: "liveblocks", model: "liveblocks", userId, orgId, invocationPoint: "collab.session", status: "success", inputTokens: 0, outputTokens: 0 },
      });
    } catch { /* metering must never block a collab token */ }
  }
  return new Response(tokenBody, { status, headers: { "Content-Type": "application/json" } });
}
