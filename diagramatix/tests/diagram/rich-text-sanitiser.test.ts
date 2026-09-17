/**
 * SEC-26 — the sanitiser must not execute what it is stripping.
 *
 * `sanitizeRichText` walked a DOM tree to a tag whitelist, which is sound. The
 * flaw was WHERE it built that tree: `document.createElement("div")` belongs to
 * the live page even while detached, so assigning `innerHTML` parses with a
 * browsing context attached and resource-load handlers fire immediately. An
 * `<img src=x onerror=…>` ran before the walk stripped a single tag — the
 * sanitiser executed the payload it was called to remove, in the session of
 * whoever opened the diagram. Untrusted values reach it from imports, the
 * diagram API and AI output, and the CSP is still report-only, so nothing else
 * stood in the way.
 *
 * The fix parses into a document from `createHTMLDocument`, which has no
 * browsing context: nothing loads and nothing runs.
 *
 * The suite runs on the node environment, so the browser branch cannot be
 * exercised here — the source assertion below is the guard for it, and the
 * behavioural tests cover the server fallback that node does take.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sanitizeRichText } from "@/app/lib/diagram/richText";

const SRC = join(process.cwd(), "app/lib/diagram/richText.ts");

describe("rich-text sanitiser", () => {
  it("T4425 — parses in an inert document, never in one attached to the page", () => {
    const src = readFileSync(SRC, "utf8");

    expect(
      src,
      "parse untrusted HTML in a document with no browsing context, or resource handlers fire while parsing",
    ).toMatch(/document\.implementation\.createHTMLDocument\(/);

    // The precise defect: a live-document element used as the parse host.
    const parseHost = /document\.createElement\(\s*["'](?:div|span|template)["']\s*\)[\s\S]{0,120}?\.innerHTML\s*=/;
    expect(
      parseHost.test(src),
      "innerHTML is being assigned to an element created from the live document — that is the SEC-26 defect",
    ).toBe(false);
  });

  it("T4426 — strips disallowed tags and every attribute, keeping the whitelist and inner text", () => {
    // The server fallback is what the node environment exercises.
    expect(sanitizeRichText('<img src=x onerror="alert(1)">')).not.toMatch(/img|onerror/i);
    expect(sanitizeRichText('<script>alert(1)</script>')).not.toMatch(/script/i);
    expect(sanitizeRichText('<svg onload="alert(1)"></svg>')).not.toMatch(/svg|onload/i);

    // A whitelisted tag survives, but loses its attributes.
    const bolded = sanitizeRichText('<b class="x" onclick="alert(1)">keep</b>');
    expect(bolded).toContain("keep");
    expect(bolded).not.toMatch(/onclick|class/i);

    // Text inside a stripped tag is preserved rather than silently lost.
    expect(sanitizeRichText("<div>plain words</div>")).toContain("plain words");
  });
});
