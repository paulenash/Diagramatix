/**
 * Duplicate a Mining-Example catalog entry into a new DRAFT (SuperAdmin) — a
 * quick "copy to extend". The full package is copied; the copy starts
 * unpublished with a fresh slug.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";

type Params = { params: Promise<{ id: string }> };

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "example";
}

export async function POST(_req: Request, { params }: Params) {
  const session = await auth();
  if (!isSuperuser(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const src = await prisma.miningExample.findUnique({ where: { id } });
  if (!src) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const title = `${src.title} (copy)`;
  let slug = slugify(title);
  for (let i = 2; await prisma.miningExample.findUnique({ where: { slug } }); i++) slug = `${slugify(title)}-${i}`;
  const max = await prisma.miningExample.aggregate({ _max: { sortOrder: true } });

  const example = await prisma.miningExample.create({
    data: {
      slug, title,
      concept: src.concept,
      description: src.description,
      difficulty: src.difficulty,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      published: false,
      createdById: session?.user?.id ?? null,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      package: src.package as any,
    },
  });
  return NextResponse.json({ example }, { status: 201 });
}
