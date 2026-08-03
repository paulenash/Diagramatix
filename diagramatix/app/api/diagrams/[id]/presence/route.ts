/**
 * Co-authoring presence heartbeat + roster.
 *
 *   POST /api/diagrams/[id]/presence
 *     Body: { userName?, selection?: string[], editingElementIds?: string[] }
 *     Upserts the caller's presence row (a heartbeat) and returns the LIVE
 *     roster (rows whose heartbeat is within the TTL) plus the merged
 *     soft-lock map (elementId → the other editor currently holding it).
 *   DELETE /api/diagrams/[id]/presence
 *     Clears the caller's presence row (fired on unload via sendBeacon/fetch).
 *
 * Polled by the editor (~8–10 s) — the same "poll a REST route" pattern as the
 * notifications bell; no server-push infra required. Gated by view access; the
 * premium/feature gate is applied on top in a later slice.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireDiagramAccess, OrgContextError } from "@/app/lib/auth/orgContext";

type Params = { params: Promise<{ id: string }> };

const PRESENCE_TTL_MS = 30_000; // a row older than this is treated as gone

// Deterministic per-user colour so everyone renders the same chip for a user.
const PALETTE = [
  "#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed",
  "#db2777", "#0891b2", "#65a30d", "#ea580c", "#4f46e5",
];
function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 500) : [];

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    await requireDiagramAccess(session, await cookies(), id, "view");
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const userId = session.user.id;
  const userName =
    (typeof body.userName === "string" && body.userName.trim()) ||
    session.user.name || session.user.email || "User";
  const selection = asStrings(body.selection);
  const editingElementIds = asStrings(body.editingElementIds);
  const color = colorFor(userId);
  const now = new Date();

  await prisma.diagramPresence.upsert({
    where: { diagramId_userId: { diagramId: id, userId } },
    create: { diagramId: id, userId, userName, color, selection, editingElementIds, lastHeartbeatAt: now },
    update: { userName, color, selection, editingElementIds, lastHeartbeatAt: now },
  });

  const cutoff = new Date(now.getTime() - PRESENCE_TTL_MS);
  const rows = await prisma.diagramPresence.findMany({
    where: { diagramId: id, lastHeartbeatAt: { gte: cutoff } },
    orderBy: { lastHeartbeatAt: "asc" },
  });
  // Best-effort prune of stale rows (don't block the response on it).
  void prisma.diagramPresence.deleteMany({ where: { diagramId: id, lastHeartbeatAt: { lt: cutoff } } }).catch(() => {});

  const roster = rows.map((r) => ({
    userId: r.userId,
    userName: r.userName,
    color: r.color,
    editingElementIds: r.editingElementIds,
    isSelf: r.userId === userId,
  }));
  // Soft-lock map: elementId → the OTHER editor holding it (first writer wins).
  const locks: Record<string, { userId: string; userName: string; color: string }> = {};
  for (const r of rows) {
    if (r.userId === userId) continue;
    for (const eid of r.editingElementIds) {
      if (!locks[eid]) locks[eid] = { userId: r.userId, userName: r.userName, color: r.color };
    }
  }
  return NextResponse.json({ roster, locks });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ ok: true });
  const { id } = await params;
  await prisma.diagramPresence.deleteMany({ where: { diagramId: id, userId: session.user.id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
