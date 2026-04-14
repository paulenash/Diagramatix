import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { execSync } from "child_process";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isImpersonating, getEffectiveUserId } from "@/app/lib/superuser";
import { getCurrentOrgId, requireRole, WRITE_ROLES, OrgContextError } from "@/app/lib/auth/orgContext";
import { buildUserBackup, restoreUserBackup } from "@/app/lib/backup";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

/**
 * GET /api/backup
 *   Download a complete backup of the current user's projects, diagrams,
 *   folders and user templates as a zipped JSON file with extension .diag
 *
 * POST /api/backup  (multipart/form-data)
 *   Field "file": a .diag file produced by GET /api/backup
 *   Restores all content into the user's current org as NEW rows. Purely
 *   additive — never deletes or overwrites.
 */

function appVersion(): string {
  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch {}
  return `${SCHEMA_VERSION}.${commitCount}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Honour superuser impersonation: backup of the *viewed* user
  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch {}

  try {
    const bytes = await buildUserBackup(userId, appVersion());

    // Build filename: Diagramatix-backup-<email>-<version>-<YYYY-MM-DD>.diag
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    const safeEmail = (user?.email ?? "user").replace(/[^a-zA-Z0-9_.-]+/g, "_");
    const today = new Date().toISOString().slice(0, 10);
    const version = appVersion();
    const filename = `Diagramatix-backup-${safeEmail}-v${version}-${today}.diag`;

    return new NextResponse(bytes as any, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backup] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Restoring is a write operation: reject if impersonating
  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch {}

  // Org context + role check
  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Parse the uploaded file
  let bytes: ArrayBuffer;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    bytes = await (file as File).arrayBuffer();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Invalid upload: ${message}` }, { status: 400 });
  }

  try {
    const ownerName = session.user.name ?? session.user.email ?? "";
    const result = await restoreUserBackup(bytes, session.user.id, orgId, ownerName);
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[backup] POST error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
