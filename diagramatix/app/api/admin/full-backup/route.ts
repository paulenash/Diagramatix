/**
 * Admin FULL system backup endpoint.
 *
 *   GET  /api/admin/full-backup
 *     Returns a `.diag-full` zip containing every row in every table,
 *     including credentials. Superuser only. Confirm-gated in the UI.
 *
 *   POST /api/admin/full-backup        (multipart/form-data, field "file")
 *     Restore. Two modes via `mode=wipe` or `mode=additive` (and a
 *     selection tree when additive). Not yet implemented in this file;
 *     Phase 2/3 will land here.
 */
import { NextResponse } from "next/server";
import { execSync } from "child_process";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { buildFullBackup } from "@/app/lib/full-backup";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

function appVersion(): string {
  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch {}
  return `${SCHEMA_VERSION}.${commitCount}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    });
    const exportedBy = admin?.email ?? "unknown-admin";
    const bytes = await buildFullBackup(exportedBy, appVersion());

    const safeEmail = exportedBy.replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const version = appVersion();
    const filename = `Diagramatix-FULL-backup-${safeEmail}-v${version}-${today}.diag-full`;

    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[admin/full-backup] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
