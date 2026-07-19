/**
 * SuperAdmin Document Editor API — one editable document collection per URL:
 *   /api/admin/documents/user-guide   → the in-app User Guide
 *   /api/admin/documents/tech-design  → SuperAdmin Technical Design Notes
 *   GET → every chapter + its sections (full markdown) for that collection.
 *   PUT → replace that collection atomically ({ chapters: [...] }); order from
 *         array position. The wipe is SCOPED to the collection, so saving one
 *         document never touches the other. SuperAdmin only.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";

export const COLLECTIONS = ["user-guide", "tech-design"] as const;
type Collection = (typeof COLLECTIONS)[number];
const isCollection = (v: string): v is Collection => (COLLECTIONS as readonly string[]).includes(v);

type Params = { params: Promise<{ collection: string }> };

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return null;
  return session;
}

export async function GET(_req: Request, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { collection } = await params;
  if (!isCollection(collection)) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });
  const chapters = await prisma.helpChapter.findMany({
    where: { collection },
    orderBy: { sortOrder: "asc" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  return NextResponse.json({ chapters });
}

type InSection = {
  heading?: string | null; bodyMarkdown?: string; adminOnly?: boolean;
  image?: string | null; imageAlt?: string | null; imageCaption?: string | null;
};
type InChapter = { slug?: string; title?: string; category?: string | null; adminOnly?: boolean; sections?: InSection[] };

const clean = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

export async function PUT(req: Request, { params }: Params) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { collection } = await params;
  if (!isCollection(collection)) return NextResponse.json({ error: "Unknown collection" }, { status: 404 });

  let body: { chapters?: InChapter[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const chapters = Array.isArray(body.chapters) ? body.chapters : null;
  if (!chapters) return NextResponse.json({ error: "chapters[] required" }, { status: 400 });
  if (JSON.stringify(chapters).length > 5_000_000) return NextResponse.json({ error: "Document too large" }, { status: 413 });

  // Validate slugs: present + unique WITHIN this collection.
  const seen = new Set<string>();
  for (const ch of chapters) {
    const slug = (ch.slug ?? "").trim();
    if (!slug) return NextResponse.json({ error: "Every chapter needs a slug" }, { status: 400 });
    if (!/^[a-z0-9-]+$/.test(slug)) return NextResponse.json({ error: `Slug must be lowercase letters/numbers/dashes: "${slug}"` }, { status: 400 });
    if (seen.has(slug)) return NextResponse.json({ error: `Duplicate slug: "${slug}"` }, { status: 400 });
    seen.add(slug);
  }

  // Remember each slug's current category so a client that omits the field (or
  // an older payload) doesn't wipe it across the delete/recreate. The editor
  // does send `category`, in which case that value wins.
  const prevCategory = new Map(
    (await prisma.helpChapter.findMany({ where: { collection }, select: { slug: true, category: true } }))
      .map(c => [c.slug, c.category]),
  );

  await prisma.$transaction(async (tx) => {
    // Scoped wipe — never touches the other collection.
    await tx.helpSection.deleteMany({ where: { collection } });
    await tx.helpChapter.deleteMany({ where: { collection } });
    for (let ci = 0; ci < chapters.length; ci++) {
      const ch = chapters[ci];
      const slug = (ch.slug ?? "").trim();
      const created = await tx.helpChapter.create({
        data: {
          slug, collection, title: (ch.title ?? "").trim() || "Untitled chapter",
          category: ch.category !== undefined ? clean(ch.category) : (prevCategory.get(slug) ?? null),
          sortOrder: ci, adminOnly: !!ch.adminOnly,
        },
      });
      const sections = Array.isArray(ch.sections) ? ch.sections : [];
      for (let si = 0; si < sections.length; si++) {
        const s = sections[si];
        await tx.helpSection.create({
          data: {
            chapterId: created.id, collection,
            heading: clean(s.heading), bodyMarkdown: typeof s.bodyMarkdown === "string" ? s.bodyMarkdown : "",
            adminOnly: !!s.adminOnly, image: clean(s.image), imageAlt: clean(s.imageAlt), imageCaption: clean(s.imageCaption), sortOrder: si,
          },
        });
      }
    }
  }, { timeout: 60_000, maxWait: 10_000 });

  return NextResponse.json({ ok: true });
}
