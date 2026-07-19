/**
 * SuperAdmin User Guide editor API.
 *   GET  → every chapter + its sections (full markdown), for the editor.
 *   PUT  → replace the whole guide atomically ({ chapters: [...] }). Chapter +
 *          section order is taken from array position. SuperAdmin only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return null;
  return session;
}

// Back-compat alias for the User Guide collection (the Document Editor now uses
// /api/admin/documents/[collection]). Scoped to "user-guide" so it can never
// touch the tech-design collection.
const COLLECTION = "user-guide";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const chapters = await prisma.helpChapter.findMany({
    where: { collection: COLLECTION },
    orderBy: { sortOrder: "asc" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json({ chapters });
}

type InSection = {
  heading?: string | null;
  bodyMarkdown?: string;
  adminOnly?: boolean;
  image?: string | null;
  imageAlt?: string | null;
  imageCaption?: string | null;
};
type InChapter = { slug?: string; title?: string; category?: string | null; adminOnly?: boolean; sections?: InSection[] };

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { chapters?: InChapter[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const chapters = Array.isArray(body.chapters) ? body.chapters : null;
  if (!chapters) return NextResponse.json({ error: "chapters[] required" }, { status: 400 });
  if (JSON.stringify(chapters).length > 5_000_000) return NextResponse.json({ error: "Guide too large" }, { status: 413 });

  // Validate slugs: present + unique.
  const seen = new Set<string>();
  for (const ch of chapters) {
    const slug = (ch.slug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "Every chapter needs a slug" }, { status: 400 });
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: `Slug must be lowercase letters/numbers/dashes: "${slug}"` }, { status: 400 });
    if (seen.has(slug)) return NextResponse.json({ error: `Duplicate slug: "${slug}"` }, { status: 400 });
    seen.add(slug);
  }

  // The editor UI doesn't yet edit `category`, and this PUT recreates every
  // chapter from scratch — so remember each slug's current category and re-apply
  // it (unless the payload explicitly carries one) to avoid wiping seeded groups.
  const prevCategory = new Map(
    (await prisma.helpChapter.findMany({
      where: { collection: COLLECTION }, select: { slug: true, category: true },
    })).map(c => [c.slug, c.category]),
  );

  await prisma.$transaction(async (tx) => {
    await tx.helpSection.deleteMany({ where: { collection: COLLECTION } });
    await tx.helpChapter.deleteMany({ where: { collection: COLLECTION } });
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const slug = (ch.slug ?? "").trim();
      const created = await tx.helpChapter.create({
        data: {
          slug,
          collection: COLLECTION,
          title: (ch.title ?? "").trim() || "Untitled chapter",
          category: ch.category !== undefined ? clean(ch.category) : (prevCategory.get(slug) ?? null),
          sortOrder: ci,
          adminOnly: !!ch.adminOnly,
        },
      });
      const sections = Array.isArray(ch.sections) ? ch.sections : [];
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        await tx.helpSection.create({
          data: {
            chapterId: created.id,
            collection: COLLECTION,
            heading: clean(s.heading),
            bodyMarkdown: typeof s.bodyMarkdown === "string" ? s.bodyMarkdown : "",
            adminOnly: !!s.adminOnly,
            image: clean(s.image),
            imageAlt: clean(s.imageAlt),
            imageCaption: clean(s.imageCaption),
            sortOrder: si,
          },
        });
      }
    }
  }, { timeout: 60_000, maxWait: 10_000 });

  return NextResponse.json({ ok: true });
}
