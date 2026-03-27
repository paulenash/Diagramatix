import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";
import { prisma } from "@/app/lib/db";
import { getEffectiveUserId, isImpersonating, SUPERUSER_EMAIL } from "@/app/lib/superuser";

const ADMIN_PASSWORD = "!Aardwolf2026";

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
        `SELECT id, name, "diagramType", "createdAt"
         FROM "DiagramTemplate"
         WHERE "templateType" = 'builtin'
         ORDER BY "updatedAt" DESC`
      );
    } else {
      let userId = session.user.id;
      try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback to session user */ }
      result = await pgPool.query(
        `SELECT id, name, "diagramType", "createdAt"
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch { /* proceed normally */ }

  const body = await req.json();
  const { name, diagramType = "bpmn", data, templateType = "user", adminPassword } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Admin authorization for built-in templates
  if (templateType === "builtin") {
    const userEmail = await getUserEmail(session.user.id);
    if (userEmail !== SUPERUSER_EMAIL && adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Invalid admin password" }, { status: 403 });
    }
  }

  try {
    const id = cuid();
    const now = new Date();
    await pgPool.query(
      `INSERT INTO "DiagramTemplate" (id, name, "diagramType", "templateType", data, "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
      [id, name.trim(), diagramType, templateType, JSON.stringify(data), session.user.id, now, now]
    );

    return NextResponse.json({ id, name: name.trim(), diagramType, createdAt: now }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function getUserEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email ?? null;
}
