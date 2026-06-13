/**
 * OrgAdmin Org-scoped backup endpoint.
 *
 *   GET  /api/org-admin/backup
 *     Returns a `.diag-full` zip containing only the caller's active Org's
 *     rows (the Org, its members, and their Org-scoped projects / diagrams
 *     / history / templates / prompts / rules). OrgAdmin (Owner/Admin of
 *     the active Org) or SuperAdmin only.
 *
 *   POST /api/org-admin/backup        (multipart/form-data)
 *     Restore, scoped to the caller's Org. Fields:
 *       file:  the .diag-full zip
 *       mode:  "inspect"  = return the selection tree (read-only)
 *              "additive" = restore the ticked rows INTO the caller's Org
 *       selections: JSON { projectIds, diagramIds, templateIds, ... }
 *     The payload is filtered to the caller's Org first, so even a wider
 *     backup can only ever restore that Org's data. No "wipe" mode.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { Session } from "next-auth";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { parseFullBackup, inspectFullBackup, type AdditiveSelection } from "@/app/lib/full-backup";
import { buildOrgBackup, scopePayloadToOrg, restoreOrgBackupAdditive } from "@/app/lib/org-backup";
import { streamBackup } from "@/app/lib/backupStream";
import { previewOrgBackup } from "@/app/lib/backupPreview";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

function appVersion(): string {
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;
  return `${SCHEMA_VERSION}.${commitCount}`;
}

// Resolve the caller's active Org and confirm they may administer it
// (SuperAdmin everywhere, or OrgMember Owner/Admin of that Org).
async function requireOrgAdminOrg(session: Session | null): Promise<{ orgId: string; email: string } | null> {
  if (!session?.user?.id) return null;
  const cookieStore = await cookies();
  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) return null;
  if (!isSuperuser(session)) {
    const m = await prisma.orgMember.findFirst({
      where: { userId: session.user.id, orgId, role: { in: ["Owner", "Admin"] } },
      select: { id: true },
    });
    if (!m) return null;
  }
  const u = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  return { orgId, email: u?.email ?? "unknown" };
}

export async function GET(req: Request) {
  const session = await auth();
  const ctx = await requireOrgAdminOrg(session);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(req.url);

  // ?preview=1 → per-member counts for the selection UI.
  if (url.searchParams.get("preview") === "1") {
    return NextResponse.json(await previewOrgBackup(ctx.orgId));
  }

  const version = appVersion();
  const org = await prisma.org.findUnique({ where: { id: ctx.orgId }, select: { name: true } });
  const safeOrg = (org?.name ?? "Org").replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const today = new Date().toISOString().slice(0, 10);
  const filename = `Diagramatix-Org-backup-${safeOrg}-v${version}-${today}.diag-full`;

  // ?stream=1 → live NDJSON progress; plain GET returns the raw zip fallback.
  // userIds (CSV) optionally narrows the backup to selected members.
  if (url.searchParams.get("stream") === "1") {
    const userIdsParam = url.searchParams.get("userIds");
    const userIds = userIdsParam ? userIdsParam.split(",").filter(Boolean) : undefined;
    return streamBackup(
      (onProgress) => buildOrgBackup(ctx.orgId, ctx.email, version, onProgress, { userIds }),
      filename,
    );
  }

  try {
    const bytes = await buildOrgBackup(ctx.orgId, ctx.email, version);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[org-admin/backup] GET error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  const ctx = await requireOrgAdminOrg(session);
  if (!ctx) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json({ error: `Invalid form upload: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 });
  }

  const file = form.get("file");
  const mode = String(form.get("mode") ?? "").toLowerCase();
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing or invalid \"file\" field" }, { status: 400 });
  }

  let bytes: ArrayBuffer;
  try { bytes = await file.arrayBuffer(); }
  catch (err) { return NextResponse.json({ error: `Could not read upload: ${err instanceof Error ? err.message : String(err)}` }, { status: 400 }); }

  let payload;
  try { payload = await parseFullBackup(bytes); }
  catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 }); }

  // Scope the payload to the caller's Org — even if they uploaded a wider
  // backup, they can only ever see / restore their own Org's data.
  const scoped = scopePayloadToOrg(payload, ctx.orgId);
  if ((scoped.tables.Org as unknown[]).length === 0) {
    return NextResponse.json(
      { error: "This backup doesn't contain your Org's data. Upload an Org backup for the Org you administer." },
      { status: 400 },
    );
  }

  if (mode === "inspect") {
    try {
      const tree = inspectFullBackup(scoped);
      return NextResponse.json({ ok: true, tree });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[org-admin/backup] POST inspect error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "additive") {
    const selectionsRaw = String(form.get("selections") ?? "");
    let selection: AdditiveSelection;
    try {
      const parsed = JSON.parse(selectionsRaw) as Partial<AdditiveSelection>;
      selection = {
        orgIds: [ctx.orgId],
        userIds: Array.isArray(parsed.userIds) ? parsed.userIds.map(String) : [],
        projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds.map(String) : [],
        diagramIds: Array.isArray(parsed.diagramIds) ? parsed.diagramIds.map(String) : [],
        templateIds: Array.isArray(parsed.templateIds) ? parsed.templateIds.map(String) : [],
      };
    } catch {
      return NextResponse.json({ error: "Additive restore requires a JSON `selections` field" }, { status: 400 });
    }
    const total = selection.userIds.length + selection.projectIds.length + selection.diagramIds.length + (selection.templateIds?.length ?? 0);
    if (total === 0) {
      return NextResponse.json({ error: "Nothing selected — tick at least one row in the tree" }, { status: 400 });
    }
    try {
      const result = await restoreOrgBackupAdditive(scoped, selection, ctx.orgId);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[org-admin/backup] POST additive error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({ error: `Unknown mode: ${mode || "(empty)"} — expected "inspect" / "additive"` }, { status: 400 });
}
