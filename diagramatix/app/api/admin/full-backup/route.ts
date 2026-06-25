/**
 * Admin FULL system backup endpoint.
 *
 *   GET  /api/admin/full-backup
 *     Returns a `.diag-full` zip containing every row in every table,
 *     including credentials. Superuser only. Confirm-gated in the UI.
 *
 *   POST /api/admin/full-backup        (multipart/form-data)
 *     Restore. Fields:
 *       file:  the .diag-full zip
 *       mode:  "wipe"      = TRUNCATE every table then re-insert
 *              "additive"  = not yet implemented (Phase 3)
 *       confirmPhrase: must equal "WIPE" for mode=wipe — belt-and-braces
 *              guard so a stray POST can't accidentally erase the DB.
 *     Returns the restore result (counts per table, log).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import {
  buildFullBackup,
  parseFullBackup,
  restoreFullBackupWipe,
  restoreFullBackupAdditive,
  restoreFullBackupTables,
  inspectFullBackup,
  type AdditiveSelection,
} from "@/app/lib/full-backup";
import { streamBackup } from "@/app/lib/backupStream";
import { previewFullBackup } from "@/app/lib/backupPreview";
import { buildOrgBackup } from "@/app/lib/org-backup";
import { SCHEMA_VERSION } from "@/app/lib/diagram/types";

function appVersion(): string {
  // Commit count baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile).
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;
  return `${SCHEMA_VERSION}.${commitCount}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);

  // ?preview=1 → orgs→members tree + totals for the selection UI.
  if (url.searchParams.get("preview") === "1") {
    return NextResponse.json(await previewFullBackup());
  }

  const admin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  });
  const exportedBy = admin?.email ?? "unknown-admin";
  const safeEmail = exportedBy.replace(/[^a-zA-Z0-9_.-]+/g, "_");
  const today = new Date().toISOString().slice(0, 10);
  const version = appVersion();

  // ?stream=1 → live NDJSON progress; plain GET returns the raw zip fallback.
  // Optional scope: orgId (+ userIds CSV) → a self-contained SCOPED backup
  // (that org's selected users' data + system config), reusing the org
  // builder. No orgId → the whole system (every table, every org).
  if (url.searchParams.get("stream") === "1") {
    const orgId = url.searchParams.get("orgId");
    if (orgId) {
      const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
      const safeOrg = (org?.name ?? "Org").replace(/[^a-zA-Z0-9_.-]+/g, "_");
      const userIdsParam = url.searchParams.get("userIds");
      const userIds = userIdsParam ? userIdsParam.split(",").filter(Boolean) : undefined;
      const scopedName = `Diagramatix-scoped-backup-${safeOrg}-v${version}-${today}.diag-full`;
      return streamBackup(
        (onProgress) => buildOrgBackup(orgId, exportedBy, version, onProgress, { userIds, includeSystemConfig: true }),
        scopedName,
      );
    }
    const filename = `Diagramatix-FULL-backup-${safeEmail}-v${version}-${today}.diag-full`;
    return streamBackup((onProgress) => buildFullBackup(exportedBy, version, onProgress), filename);
  }

  const filename = `Diagramatix-FULL-backup-${safeEmail}-v${version}-${today}.diag-full`;

  try {
    const bytes = await buildFullBackup(exportedBy, version);
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

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid form upload: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const mode = String(form.get("mode") ?? "").toLowerCase();
  const confirmPhrase = String(form.get("confirmPhrase") ?? "");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing or invalid \"file\" field" }, { status: 400 });
  }

  // Read + parse first so we can return a meaningful error before any
  // destructive action.
  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read upload: ${err instanceof Error ? err.message : String(err)}` },
      { status: 400 },
    );
  }

  let payload;
  try {
    payload = await parseFullBackup(bytes);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  if (mode === "inspect") {
    // Read-only — returns the selection tree so the admin can tick
    // what to restore additively. No DB write.
    try {
      const tree = inspectFullBackup(payload);
      return NextResponse.json({ ok: true, tree });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[admin/full-backup] POST inspect error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "wipe") {
    if (confirmPhrase !== "WIPE") {
      return NextResponse.json(
        { error: "Wipe restore requires confirmPhrase = \"WIPE\"" },
        { status: 400 },
      );
    }
    try {
      const result = await restoreFullBackupWipe(payload);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[admin/full-backup] POST wipe error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "additive") {
    const selectionsRaw = String(form.get("selections") ?? "");
    let selection: AdditiveSelection;
    try {
      const parsed = JSON.parse(selectionsRaw) as Partial<AdditiveSelection>;
      selection = {
        orgIds: Array.isArray(parsed.orgIds) ? parsed.orgIds.map(String) : [],
        userIds: Array.isArray(parsed.userIds) ? parsed.userIds.map(String) : [],
        projectIds: Array.isArray(parsed.projectIds) ? parsed.projectIds.map(String) : [],
        diagramIds: Array.isArray(parsed.diagramIds) ? parsed.diagramIds.map(String) : [],
        templateIds: Array.isArray(parsed.templateIds) ? parsed.templateIds.map(String) : [],
      };
    } catch {
      return NextResponse.json(
        { error: "Additive restore requires a JSON `selections` field with orgIds/userIds/projectIds/diagramIds/templateIds arrays" },
        { status: 400 },
      );
    }
    const total =
      selection.orgIds.length + selection.userIds.length +
      selection.projectIds.length + selection.diagramIds.length +
      (selection.templateIds?.length ?? 0);
    if (total === 0) {
      return NextResponse.json(
        { error: "Nothing selected — tick at least one row in the tree" },
        { status: 400 },
      );
    }
    try {
      const result = await restoreFullBackupAdditive(payload, selection);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[admin/full-backup] POST additive error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (mode === "tables") {
    // Per-table additive upsert of a chosen subset. SuperAdmin-only (this whole
    // route is gated above); NOT exposed on the OrgAdmin backup flow.
    if (confirmPhrase !== "RESTORE") {
      return NextResponse.json(
        { error: "Per-table restore requires confirmPhrase = \"RESTORE\"" },
        { status: 400 },
      );
    }
    let tables: string[];
    try {
      const parsed = JSON.parse(String(form.get("tables") ?? "[]"));
      tables = Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return NextResponse.json(
        { error: "Per-table restore requires a JSON `tables` array of table names" },
        { status: 400 },
      );
    }
    if (tables.length === 0) {
      return NextResponse.json({ error: "Nothing selected — tick at least one table" }, { status: 400 });
    }
    try {
      const result = await restoreFullBackupTables(payload, tables);
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[admin/full-backup] POST tables error:", message);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { error: `Unknown mode: ${mode || "(empty)"} — expected "inspect" / "wipe" / "additive" / "tables"` },
    { status: 400 },
  );
}
