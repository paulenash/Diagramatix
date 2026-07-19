/**
 * SuperAdmin User Guide backup. GET → a `.diag-guide` ZIP (content + the whole
 * image library, ids preserved). Core logic in app/lib/help/guideBackup.ts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { buildGuideBackup } from "@/app/lib/help/guideBackup";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const bytes = await buildGuideBackup("user-guide", session.user.email ?? null);
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="user-guide-backup.diag-guide"`,
    },
  });
}
