/**
 * SEC-22 — an imported template's preview is never trusted.
 *
 * `thumbnailSvg` was carried straight out of the uploaded JSON and stored, and
 * it is rendered with `dangerouslySetInnerHTML` in two places: the admin
 * template list and the editor's template picker. So a crafted export whose
 * thumbnail held `<img src=x onerror=…>` executed in the session of whoever
 * opened either — including an ordinary user in the editor, not just an
 * administrator.
 *
 * The preview is derived data: it can always be rebuilt from `data`. Importing
 * now regenerates it and discards whatever the file claimed, which closes the
 * path at the source rather than trying to sanitise SVG at the sink.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const IMPORT_ROUTE = join(process.cwd(), "app/api/templates/import/route.ts");

describe("template import", () => {
  it("T4430 — regenerates the preview and never stores the uploaded one", () => {
    const src = readFileSync(IMPORT_ROUTE, "utf8");

    // The uploaded value must not reach the insert.
    expect(
      /thumb\s*(?::[^=]*)?=\s*typeof\s+t\.thumbnailSvg/.test(src),
      "the uploaded thumbnailSvg is being stored — it is rendered with dangerouslySetInnerHTML downstream",
    ).toBe(false);

    // It must be built from the template's own data instead.
    expect(src, "regenerate the preview from `data`").toMatch(/renderTemplateThumbnailSvg\(/);

    // And the regeneration must be unconditional, not a fallback for when the
    // upload happened to omit one.
    const guardedFallback = /if\s*\(\s*!thumb\s*\)\s*\{[\s\S]{0,160}renderTemplateThumbnailSvg/;
    expect(
      guardedFallback.test(src),
      "regeneration must not be conditional on the upload omitting a thumbnail",
    ).toBe(false);
  });

  it("T4431 — the two render sites still expect a stored preview, so the write path is the right place to fix it", () => {
    // If either of these stops rendering raw markup the fix above can be
    // revisited; until then the write path is the only guard.
    const adminList = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/admin/templates/TemplatesClient.tsx"), "utf8");
    const picker = readFileSync(join(process.cwd(), "app/(dashboard)/diagram/[id]/TemplateThumbnail.tsx"), "utf8");
    expect(adminList).toMatch(/dangerouslySetInnerHTML/);
    expect(picker).toMatch(/dangerouslySetInnerHTML/);
  });
});
