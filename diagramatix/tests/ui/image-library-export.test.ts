/**
 * T5267 — Image Library export (Paul, 2026-10-06): one image downloads as itself, a selection as one .zip. Names are made safe and unique.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { safeImageFilename, uniqueNames } from "@/app/lib/help/exportImages";

describe("T5267 export file names", () => {
  it("keeps a real extension, supplies one from the MIME type, and strips path characters", () => {
    expect(safeImageFilename("shot.png")).toBe("shot.png");
    expect(safeImageFilename("Dashboard capture", "image/jpeg")).toBe("Dashboard capture.jpg");
    expect(safeImageFilename("a/b:c?.png")).toBe("a_b_c_.png");
    expect(safeImageFilename("  ")).toBe("image");
  });
  it("makes duplicate names unique, case-insensitively, before the extension", () => {
    expect(uniqueNames(["a.png", "A.png", "b.png", "a.png"])).toEqual(["a.png", "A (2).png", "b.png", "a (3).png"]);
  });
});

describe("T5267 the Image Library screen", () => {
  const src = readFileSync("app/(dashboard)/dashboard/admin/image-library/ImageLibraryClient.tsx", "utf8");
  it("has a checkbox per image, Select all, Export selected and a per-image Export", () => {
    expect(src).toContain('title="Select for export"');
    expect(src).toContain('"Select all"');
    expect(src).toContain("Export selected");
    expect(src).toContain("void doExport([img])");
  });
});
