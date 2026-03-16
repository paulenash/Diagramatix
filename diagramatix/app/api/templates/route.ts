import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { pgPool } from "@/app/lib/db";

function cuid() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `c${ts}${rand}`;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await pgPool.query(
      `SELECT id, name, "diagramType", "createdAt"
       FROM "DiagramTemplate"
       WHERE "userId" = $1
       ORDER BY "updatedAt" DESC`,
      [session.user.id]
    );
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

  const body = await req.json();
  const { name, diagramType = "bpmn", data } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  try {
    const id = cuid();
    const now = new Date();
    await pgPool.query(
      `INSERT INTO "DiagramTemplate" (id, name, "diagramType", data, "userId", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [id, name.trim(), diagramType, JSON.stringify(data), session.user.id, now, now]
    );

    return NextResponse.json({ id, name: name.trim(), diagramType, createdAt: now }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/templates] error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
