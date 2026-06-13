/**
 * Admin AI Rules + Prompts transfer endpoint.
 *
 *   GET  /api/admin/rules-prefs
 *     Superuser-only. Returns a JSON file (Content-Type:
 *     application/json, filename "<iso-date>.diag-rules") containing
 *     every row in `DiagramRules` and `Prompt`. Used to migrate AI
 *     configuration from local-dev DB to prod web DB.
 *
 *   POST /api/admin/rules-prefs   (multipart/form-data, field "file")
 *     Superuser-only. Reads a `.diag-rules` file, additively merges
 *     into the target DB — existing rows with matching id are updated,
 *     new rows are inserted, target-only rows are left intact (never
 *     deletes). Rows referencing a non-existent user or org are
 *     skipped with the reason returned in the response so the admin
 *     can decide what to do (typically: import users/orgs first, then
 *     re-run).
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import {
  buildRulesPrefsBundle,
  restoreRulesPrefsBundle,
  type RulesPrefsBundle,
} from "@/app/lib/rules-prefs-backup";
import { streamBackup } from "@/app/lib/backupStream";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const email = session.user.email ?? "(unknown)";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${stamp}.diag-rules`;

  // ?stream=1 → live NDJSON progress + report; plain GET returns the JSON.
  if (new URL(req.url).searchParams.get("stream") === "1") {
    return streamBackup(
      async (onProgress) => {
        const bundle = await buildRulesPrefsBundle(email, onProgress);
        return new TextEncoder().encode(JSON.stringify(bundle, null, 2));
      },
      filename,
    );
  }

  try {
    const bundle = await buildRulesPrefsBundle(email);
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error("Rules+Prompts export failed:", err);
    const msg = err instanceof Error ? err.message : "Export failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    const text = await file.text();
    let bundle: RulesPrefsBundle;
    try {
      bundle = JSON.parse(text) as RulesPrefsBundle;
    } catch (parseErr) {
      const m = parseErr instanceof Error ? parseErr.message : String(parseErr);
      return NextResponse.json({ error: `Not a valid .diag-rules file (JSON parse failed: ${m})` }, { status: 400 });
    }
    if (!bundle || typeof bundle !== "object" || !("schemaVersion" in bundle)) {
      return NextResponse.json({ error: "Not a .diag-rules file (missing schemaVersion)" }, { status: 400 });
    }
    const result = await restoreRulesPrefsBundle(bundle);
    return NextResponse.json({
      ok: true,
      exportedAt: bundle.exportedAt,
      exportedBy: bundle.exportedBy,
      sourceCounts: bundle.counts,
      ...result,
    });
  } catch (err) {
    console.error("Rules+Prompts import failed:", err);
    const msg = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
