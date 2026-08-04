/**
 * Intent → template keyword catalog (assist semantic suggestion).
 *
 *   GET  /api/admin/intent-keywords   → all rows (any signed-in user; the
 *        editor fetches these to match a selected element's name). Non-sensitive.
 *   PUT  /api/admin/intent-keywords   → replace the whole catalog. SuperAdmin only.
 *        Body: { rows: { label, keywords: string[], targetCategory?, targetTemplateName?, sortOrder? }[] }
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

interface RowInput {
  label?: string;
  keywords?: unknown;
  targetCategory?: string | null;
  targetTemplateName?: string | null;
  sortOrder?: number;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.intentKeywordMap.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
  return NextResponse.json({ rows });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { rows?: RowInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const incoming = Array.isArray(body.rows) ? body.rows : null;
  if (!incoming) {
    return NextResponse.json({ error: "Missing rows array" }, { status: 400 });
  }

  // Validate + normalise every row before touching the DB.
  let clean: { label: string; keywords: string[]; targetCategory: string | null; targetTemplateName: string | null; sortOrder: number }[];
  try {
    clean = incoming.map((r, i) => {
      const label = typeof r.label === "string" ? r.label.trim() : "";
      if (!label) throw new Error("Every row needs a label");
      const keywords = Array.isArray(r.keywords)
        ? (r.keywords as unknown[]).map((k) => String(k).trim()).filter(Boolean)
        : [];
      if (keywords.length === 0) throw new Error(`"${label}": at least one keyword is required`);
      const targetCategory = r.targetCategory?.toString().trim() || null;
      const targetTemplateName = r.targetTemplateName?.toString().trim() || null;
      if (!targetCategory && !targetTemplateName) throw new Error(`"${label}": set a category or a template name`);
      return { label, keywords, targetCategory, targetTemplateName, sortOrder: Number.isFinite(r.sortOrder) ? Number(r.sortOrder) : i };
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invalid row" }, { status: 400 });
  }

  try {
    await prisma.$transaction([
      prisma.intentKeywordMap.deleteMany({}),
      prisma.intentKeywordMap.createMany({ data: clean }),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  const rows = await prisma.intentKeywordMap.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
  return NextResponse.json({ rows });
}
