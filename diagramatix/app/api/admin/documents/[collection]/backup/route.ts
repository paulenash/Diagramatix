/**
 * SuperAdmin per-collection document backup. GET → a `.diag-guide` ZIP of one
 * document collection (User Guide or Technical Design Notes) — content + the whole
 * image library, ids preserved. Core logic in app/lib/help/guideBackup.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { buildGuideBackup } from "@/app/lib/help/guideBackup";
import { COLLECTIONS } from "../route";

type Params = { params: Promise<{ collection: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { collection } = await params;
  if (!(COLLECTIONS as readonly string[]).includes(collection)) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  const bytes = await buildGuideBackup(collection, session.user.email ?? null);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${collection}-backup.diag-guide"`,
    },
  });
}
