/**
 * renderHelpMarkdown — Markdown → sanitised HTML for the live guide + editor
 * preview. Guards the sanitiser allowlist (security) and the :sym[] swap.
 * Pure function; no DB.
 */
import { describe, it, expect } from "vitest";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";

describe("renderHelpMarkdown", () => {
  it("strips <script> while keeping the surrounding text", () => {
    const html = renderHelpMarkdown("Hello <script>alert(1)</script> world");
    expect(html).not.toContain("<script");
    expect(html).toContain("Hello");
    expect(html).toContain("world");
  });

  it("renders a GFM table", () => {
    const html = renderHelpMarkdown("| A | B |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table");
    expect(html).toContain("<td");
    expect(html).toContain("1");
  });

  it("swaps :sym[task]: for an inline SVG glyph", () => {
    const html = renderHelpMarkdown("A task :sym[task]: here");
    expect(html).toContain("<svg");
  });

  it("allows library image refs and data-URI images", () => {
    expect(renderHelpMarkdown("![x](/api/help/images/abc123)")).toContain('src="/api/help/images/abc123"');
    expect(renderHelpMarkdown("![y](data:image/png;base64,iVBORw0KG)")).toContain("data:image/png;base64");
  });

  it("drops a javascript: image src", () => {
    expect(renderHelpMarkdown("![x](javascript:alert(1))")).not.toContain("javascript:");
  });

  it("renders basic formatting (bold, lists, links)", () => {
    const html = renderHelpMarkdown("**bold** and [link](https://example.com)\n\n- one\n- two");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain("<li>");
  });

  it("returns an empty string for empty input", () => {
    expect(renderHelpMarkdown("")).toBe("");
  });
});
