/**
 * Help Image Library — usage tracking + reference re-pointing.
 *   • extractImageIds pulls ids from the section image field + inline markdown,
 *   • computeImageUsages maps every id → where it's used across BOTH collections,
 *   • repointReferences rewrites target→source ONLY in the chosen collections,
 *     keeps the superseded image (no delete), and respects the id boundary so a
 *     longer id sharing a prefix isn't corrupted.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { extractImageIds, computeImageUsages, repointReferences } from "@/app/lib/help/imageUsage";

beforeEach(truncateAll);

describe("image usage", () => {
  it("extractImageIds pulls ids from a field value / markdown, deduped", () => {
    expect(extractImageIds("![a](/api/help/images/abc123) and /api/help/images/def456").sort())
      .toEqual(["abc123", "def456"]);
    expect(extractImageIds("![a](/api/help/images/abc123) again /api/help/images/abc123")).toEqual(["abc123"]);
    expect(extractImageIds(null)).toEqual([]);
    expect(extractImageIds("no images here")).toEqual([]);
  });

  it("T0903 — computeImageUsages maps ids across both collections (image field + inline)", async () => {
    const ug = await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "ug", title: "UG", sortOrder: 0 } });
    const td = await prisma.helpChapter.create({ data: { collection: "tech-design", slug: "td", title: "TD", sortOrder: 0 } });
    await prisma.helpSection.create({ data: {
      chapterId: ug.id, collection: "user-guide", heading: "S1", sortOrder: 0,
      image: "/api/help/images/img1",
      bodyMarkdown: "see ![x](/api/help/images/img1) and ![y](/api/help/images/img2)",
    } });
    await prisma.helpSection.create({ data: {
      chapterId: td.id, collection: "tech-design", heading: "S2", sortOrder: 0,
      bodyMarkdown: "![z](/api/help/images/img1)",
    } });

    const map = await computeImageUsages();
    const img1 = map.get("img1") ?? [];
    expect(img1.length).toBe(3); // ug image-field + ug inline + td inline
    expect(new Set(img1.map((u) => u.collection))).toEqual(new Set(["user-guide", "tech-design"]));
    expect(new Set(img1.map((u) => u.where))).toEqual(new Set(["image", "inline"]));
    expect(map.get("img2")?.length).toBe(1);
    expect(map.get("nope")).toBeUndefined();
  });

  it("T0904 — repointReferences re-points target→source in selected collections only, keeps the target", async () => {
    const ug = await prisma.helpChapter.create({ data: { collection: "user-guide", slug: "ug", title: "UG", sortOrder: 0 } });
    const td = await prisma.helpChapter.create({ data: { collection: "tech-design", slug: "td", title: "TD", sortOrder: 0 } });
    // 'old' = target; 'oldx' shares a prefix and MUST NOT be rewritten (id boundary).
    const ugSec = await prisma.helpSection.create({ data: {
      chapterId: ug.id, collection: "user-guide", sortOrder: 0,
      image: "/api/help/images/old",
      bodyMarkdown: "![](/api/help/images/old) keep ![](/api/help/images/oldx)",
    } });
    const tdSec = await prisma.helpSection.create({ data: {
      chapterId: td.id, collection: "tech-design", sortOrder: 0,
      bodyMarkdown: "![](/api/help/images/old)",
    } });

    const res = await repointReferences("new", "old", ["user-guide"]);
    expect(res.sections).toBe(1);

    const ugAfter = await prisma.helpSection.findUnique({ where: { id: ugSec.id } });
    expect(ugAfter?.image).toBe("/api/help/images/new");
    // 'old' rewritten to 'new'; 'oldx' preserved (boundary).
    expect(ugAfter?.bodyMarkdown).toBe("![](/api/help/images/new) keep ![](/api/help/images/oldx)");

    // tech-design was NOT selected → untouched.
    const tdAfter = await prisma.helpSection.findUnique({ where: { id: tdSec.id } });
    expect(tdAfter?.bodyMarkdown).toBe("![](/api/help/images/old)");

    // Same source/target, or empty collections → no-op.
    expect((await repointReferences("x", "x", ["user-guide"])).sections).toBe(0);
    expect((await repointReferences("new", "old", [])).sections).toBe(0);
  });
});
