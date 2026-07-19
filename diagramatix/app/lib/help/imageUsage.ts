/**
 * Help Image Library — usage tracking + reference re-pointing (server-side).
 *
 * Images (HelpImage) are referenced by HelpSection in exactly two places: the
 * `image` column (an exact /api/help/images/<id> URL) and inline in `bodyMarkdown`
 * (![alt](/api/help/images/<id>)). References span BOTH document collections
 * ("user-guide" / "tech-design") in the shared HelpSection table. There is no link
 * table, so usage is computed by scanning sections (fine at pilot scale).
 */
import { prisma } from "@/app/lib/db";

// Canonical Image Library reference matcher — captures the <id> from a
// /api/help/images/<id> URL. Matches the charset used by embedImages.ts.
const IMG_URL = "/api/help/images/";
const idBoundary = "(?![A-Za-z0-9_-])";

/** Every distinct image id referenced by a piece of text (section.image or markdown). */
export function extractImageIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  const re = /\/api\/help\/images\/([A-Za-z0-9_-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) ids.add(m[1]);
  return Array.from(ids);
}

export interface ImageUsage {
  collection: string;
  chapterSlug: string;
  chapterTitle: string;
  sectionId: string;
  sectionHeading: string | null;
  where: "image" | "inline";
}

/** Map every image id → where it's used (across both collections). */
export async function computeImageUsages(): Promise<Map<string, ImageUsage[]>> {
  const sections = await prisma.helpSection.findMany({
    select: {
      id: true, collection: true, heading: true, image: true, bodyMarkdown: true,
      chapter: { select: { slug: true, title: true } },
    },
  });
  const map = new Map<string, ImageUsage[]>();
  const add = (id: string, u: ImageUsage) => {
    const arr = map.get(id);
    if (arr) arr.push(u); else map.set(id, [u]);
  };
  for (const s of sections) {
    const base = {
      collection: s.collection,
      chapterSlug: s.chapter?.slug ?? "",
      chapterTitle: s.chapter?.title ?? "",
      sectionId: s.id,
      sectionHeading: s.heading,
    };
    for (const id of extractImageIds(s.image)) add(id, { ...base, where: "image" });
    for (const id of extractImageIds(s.bodyMarkdown)) add(id, { ...base, where: "inline" });
  }
  return map;
}

/**
 * Re-point every reference to `targetId` → `sourceId` in the given collections
 * (both section.image and inline bodyMarkdown). Never deletes the target image —
 * it's simply left unlinked. Returns how many sections were rewritten.
 */
export async function repointReferences(
  sourceId: string,
  targetId: string,
  collections: string[],
): Promise<{ sections: number }> {
  if (!sourceId || !targetId || sourceId === targetId || collections.length === 0) return { sections: 0 };
  const targetUrl = `${IMG_URL}${targetId}`;
  const sourceUrl = `${IMG_URL}${sourceId}`;
  // id-boundary so targetId can't match as a prefix of a longer id at that spot.
  const re = new RegExp(`/api/help/images/${targetId}${idBoundary}`, "g");

  const sections = await prisma.helpSection.findMany({
    where: {
      collection: { in: collections },
      OR: [{ image: targetUrl }, { bodyMarkdown: { contains: targetUrl } }],
    },
    select: { id: true, image: true, bodyMarkdown: true },
  });

  let changed = 0;
  await prisma.$transaction(async (tx) => {
    for (const s of sections) {
      const newImage = s.image ? s.image.replace(re, sourceUrl) : s.image;
      const newBody = s.bodyMarkdown.replace(re, sourceUrl);
      if (newImage !== s.image || newBody !== s.bodyMarkdown) {
        await tx.helpSection.update({ where: { id: s.id }, data: { image: newImage, bodyMarkdown: newBody } });
        changed++;
      }
    }
  });
  return { sections: changed };
}
