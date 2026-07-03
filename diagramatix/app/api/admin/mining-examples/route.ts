/**
 * Admin Mining-Example catalog API (SuperAdmin only).
 *
 *   GET  /api/admin/mining-examples
 *     Every catalog entry (draft + published), sorted by sortOrder.
 *   POST /api/admin/mining-examples  { title, concept?, description?,
 *        difficulty?, slug?, package? }
 *     Create a new (draft) entry. A unique slug is derived from the title.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { emptyMiningPackage, validateMiningExamplePackage } from "@/app/lib/mining/examplePackage";

const DIFFICULTIES = new Set(["intro", "core", "advanced"]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "example";
}

export async function GET() {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const examples = await prisma.miningExample.findMany({ orderBy: { sortOrder: "asc" } });
  return NextResponse.json({ examples });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });

  const pkg = body.package ?? emptyMiningPackage();
  const errs = validateMiningExamplePackage(pkg);
  if (errs.length && body.package !== undefined) {
    return NextResponse.json({ error: `Invalid package: ${errs.join("; ")}` }, { status: 400 });
  }

  let slug = typeof body.slug === "string" && body.slug ? slugify(body.slug) : slugify(title);
  for (let i = 2; await prisma.miningExample.findUnique({ where: { slug } }); i++) slug = `${slugify(title)}-${i}`;

  const max = await prisma.miningExample.aggregate({ _max: { sortOrder: true } });
  const example = await prisma.miningExample.create({
    data: {
      slug, title,
      concept: typeof body.concept === "string" ? body.concept : "",
      description: typeof body.description === "string" ? body.description : "",
      difficulty: DIFFICULTIES.has(body.difficulty) ? body.difficulty : "core",
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      createdById: session?.user?.id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      package: pkg as any,
    },
  });
  return NextResponse.json({ example }, { status: 201 });
}
