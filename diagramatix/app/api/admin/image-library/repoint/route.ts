/**
 * SuperAdmin — re-point every reference from a superseded image (targetId) to a
 * replacement image (sourceId) in the chosen document collections. The superseded
 * image is NOT deleted, just left unlinked. Body: { sourceId, targetId, collections[] }.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { repointReferences } from "@/app/lib/help/imageUsage";

const COLLECTIONS = new Set(["user-guide", "tech-design"]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { sourceId?: string; targetId?: string; collections?: string[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const sourceId = (body.sourceId ?? "").trim();
  const targetId = (body.targetId ?? "").trim();
  const collections = (Array.isArray(body.collections) ? body.collections : []).filter((c) => COLLECTIONS.has(c));

  if (!sourceId || !targetId) return NextResponse.json({ error: "sourceId and targetId required" }, { status: 400 });
  if (sourceId === targetId) return NextResponse.json({ error: "Source and target are the same image" }, { status: 400 });
  if (collections.length === 0) return NextResponse.json({ error: "Select at least one document" }, { status: 400 });

  // Both images must still exist.
  const count = await prisma.helpImage.count({ where: { id: { in: [sourceId, targetId] } } });
  if (count < 2) return NextResponse.json({ error: "Source or target image no longer exists" }, { status: 404 });

  const result = await repointReferences(sourceId, targetId, collections);
  return NextResponse.json({ ok: true, ...result });
}
