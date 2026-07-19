/**
 * SuperAdmin User Guide restore. POST (multipart, a `.diag-guide` ZIP from
 * ../backup) → wipes the three guide tables and re-inserts every row with its
 * ORIGINAL id (whole image library + all chapters/sections). Core logic in
 * app/lib/help/guideBackup.ts. Malformed/foreign files are rejected (400)
 * before the DB is touched.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { restoreGuideBackup } from "@/app/lib/help/guideBackup";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "file required" }, { status: 400 });

  try {
    const result = await restoreGuideBackup(await file.arrayBuffer(), session.user.id, "user-guide");
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Restore failed" }, { status: 400 });
  }
}
