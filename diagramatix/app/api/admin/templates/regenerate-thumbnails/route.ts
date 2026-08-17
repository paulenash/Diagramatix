/**
 * Regenerate DiagramTemplate.thumbnailSvg for every template (or just the
 * built-ins) from each row's OWN current `data`. Superuser only.
 *
 * Server-side twin of scripts/regen-template-thumbnails.ts — surfaced as a
 * button on the admin Database Manager so an admin can roll out a
 * renderer/palette change (or backfill missing thumbnails) without the CLI or
 * handling the prod DATABASE_URL. `data` is never touched, so hand edits to a
 * template are preserved; only the derived thumbnail is refreshed.
 */
import { NextResponse } from "next/server";
import { serverError } from "@/app/lib/apiError";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { renderTemplateThumbnailSvg } from "@/app/lib/diagram/templateThumbnail";
import type { TemplateData } from "@/app/lib/diagram/types";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scope, templateId } = (await req.json().catch(() => ({}))) as { scope?: string; templateId?: string };
  const onlyBuiltin = scope === "builtin";

  try {
    // Single template (from Template Management) or a bulk pass (all / built-ins).
    const where = templateId ? `WHERE id = $1` : (onlyBuiltin ? `WHERE "templateType" = 'builtin'` : "");
    const rows = (await pgPool.query(
      `SELECT id, data FROM "DiagramTemplate" ${where}`,
      templateId ? [templateId] : []
    )).rows as { id: string; data: TemplateData }[];

    let updated = 0, skipped = 0;
    for (const r of rows) {
      // pg parses jsonb into a JS object, so `data` is ready to render.
      const svg = renderTemplateThumbnailSvg(r.data);
      if (!svg) { skipped++; continue; }
      await pgPool.query(
        `UPDATE "DiagramTemplate" SET "thumbnailSvg" = $1, "updatedAt" = NOW() WHERE id = $2`,
        [svg, r.id]
      );
      updated++;
    }

    return NextResponse.json({ updated, skipped, total: rows.length, scope: onlyBuiltin ? "builtin" : "all" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/templates/regenerate-thumbnails] error:", message);
    return serverError(err);
  }
}
