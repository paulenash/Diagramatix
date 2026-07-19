/**
 * SuperAdmin per-collection document restore. POST (multipart, a `.diag-guide`
 * ZIP from ../backup) → wipes that collection and re-inserts every row with its
 * ORIGINAL id (chapters/sections + the referenced image library). The file's
 * collection must match the URL collection (guards against importing a Technical
 * Design Notes file over the User Guide). Core logic in app/lib/help/guideBackup.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { restoreGuideBackup } from "@/app/lib/help/guideBackup";
import { COLLECTIONS } from "../route";

type Params = { params: Promise<{ collection: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { collection } = await params;
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });

  try {
    const result = await restoreGuideBackup(await file.arrayBuffer(), session.user.id, collection);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Restore failed" }, { status: 400 });
  }
}
