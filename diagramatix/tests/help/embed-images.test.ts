/**
 * Image "use" / handling — finding library image references in Markdown and
 * embedding them as base64 for external artifacts (SharePoint documents,
 * self-contained export). Library refs are stored once and only embedded when
 * producing something that leaves the app. Pure logic + a mocked fetch.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { findAppImageUrls, embedMarkdownImages } from "@/app/lib/help/embedImages";

describe("findAppImageUrls", () => {
  it("finds /api/help/images and /help/images refs, dedupes, ignores external", () => {
    const md = [
      "![a](/api/help/images/abc123)",
      "![b](/help/images/foo.png)",
      "![a again](/api/help/images/abc123)",
      "![ext](https://example.com/x.png)",
    ].join("\n");
    const urls = findAppImageUrls(md);
    expect(urls).toContain("/api/help/images/abc123");
    expect(urls).toContain("/help/images/foo.png");
    expect(urls).not.toContain("https://example.com/x.png");
    expect(urls.filter((u) => u === "/api/help/images/abc123")).toHaveLength(1); // deduped
  });

  it("returns [] when there are no library refs", () => {
    expect(findAppImageUrls("text ![x](https://e.com/y.png) more")).toEqual([]);
  });
});

describe("embedMarkdownImages", () => {
  afterEach(() => vi.restoreAllMocks());

  it("embeds a library ref as base64, leaves external + missing untouched", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/help/images/good") {
        return { ok: true, blob: async () => new Blob([png], { type: "image/png" }) } as unknown as Response;
      }
      return { ok: false, blob: async () => new Blob([]) } as unknown as Response; // 404 for "missing"
    }));

    const md = "A ![g](/api/help/images/good) B ![m](/api/help/images/missing) C ![e](https://x.com/e.png)";
    const out = await embedMarkdownImages(md);

    expect(out).toContain("data:image/png;base64,");     // good → embedded
    expect(out).not.toContain("/api/help/images/good");  // its ref was replaced
    expect(out).toContain("/api/help/images/missing");   // 404 → left as-is
    expect(out).toContain("https://x.com/e.png");        // external → untouched
  });

  it("returns the markdown unchanged when there are no library refs", async () => {
    const md = "no refs ![x](https://e.com/y.png)";
    expect(await embedMarkdownImages(md)).toBe(md);
  });
});
