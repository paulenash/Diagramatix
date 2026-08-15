import { NextResponse } from "next/server";
import { serverError } from "@/app/lib/apiError";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isReadOnlyImpersonation, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { isAdminPasswordValid } from "@/app/lib/adminPassword";
import { renderTemplateThumbnailSvg } from "@/app/lib/diagram/templateThumbnail";
// Elevation for non-superuser callers that want to create built-in templates is
// gated by the ADMIN_PASSWORD env (set in Key Vault for prod). isAdminPasswordValid
// treats an unset/empty secret as elevation-DISABLED (SEC-02 — it used to fail open).

function cuid() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${ts}${rand}`;
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || "user";

  try {
    let result;
    if (type === "builtin") {
      result = await pgPool.query(
        `SELECT id, name, "diagramType", "group", description, "thumbnailSvg", "createdAt",
                EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'elements', '[]'::jsonb)) e
                         WHERE e->>'type' IN ('pool','lane','sublane')) AS "hasContainer"
         FROM "DiagramTemplate"
         WHERE "templateType" = 'builtin'
         ORDER BY "updatedAt" DESC`
      );
    } else {
      let userId = session.user.id;
      try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback to session user */ }
      result = await pgPool.query(
        `SELECT id, name, "diagramType", "group", description, "thumbnailSvg", "createdAt",
                EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(data->'elements', '[]'::jsonb)) e
                         WHERE e->>'type' IN ('pool','lane','sublane')) AS "hasContainer"
         FROM "DiagramTemplate"
         WHERE "templateType" = 'user' AND "userId" = $1
         ORDER BY "updatedAt" DESC`,
        [userId]
      );
    }
    return NextResponse.json(result.rows);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/templates] error:", message);
    return serverError(err);
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* proceed normally */ }

  const body = await req.json();
  const { name, diagramType = "bpmn", data, templateType = "user", adminPassword, group, description } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // One-line description + a vector preview generated from the fragment.
  const descValue: string | null = typeof description === "string" && description.trim() ? description.trim() : null;
  let thumbnailSvg: string | null = null;
  try { thumbnailSvg = data ? renderTemplateThumbnailSvg(data) || null : null; } catch { thumbnailSvg = null; }

  // Admin authorization for built-in templates
  if (templateType === "builtin") {
    const userEmail = await getUserEmail(session.user.id);
    if ((!userEmail || !SUPERUSER_EMAILS.has(userEmail)) && !isAdminPasswordValid(adminPassword)) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
    }
  }

  // Normalise group: trim, empty string → null (ungrouped).
  const groupTrimmed = typeof group === "string" ? group.trim() : "";
  const groupValue: string | null = groupTrimmed.length > 0 ? groupTrimmed : null;

  try {
    const id = cuid();
    const now = new Date();
    await pgPool.query(
      `INSERT INTO "DiagramTemplate" (id, name, "diagramType", "templateType", "group", description, "thumbnailSvg", data, "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11)`,
      [id, name.trim(), diagramType, templateType, groupValue, descValue, thumbnailSvg, JSON.stringify(data), session.user.id, now, now]
    );

    return NextResponse.json({ id, name: name.trim(), diagramType, group: groupValue, description: descValue, thumbnailSvg, createdAt: now }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates] error:", message);
    return serverError(err);
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}
