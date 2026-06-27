import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { symbolGlyphSvg } from "./symbolGlyph";

marked.setOptions({ gfm: true, breaks: false });

const SYM_RE = /:sym\[([a-z0-9-]{1,40})\]:/gi;

const SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "strong", "em", "u", "s", "del",
    "code", "pre", "blockquote", "ul", "ol", "li", "table", "thead", "tbody",
    "tr", "th", "td", "a", "br", "span", "div", "hr", "img",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    th: ["colspan", "rowspan", "align"],
    td: ["colspan", "rowspan", "align"],
    span: ["class"],
    div: ["class"],
  },
  allowedClasses: {
    span: ["callout", "callout-info", "callout-warn", "callout-tip"],
    div: ["callout", "callout-info", "callout-warn", "callout-tip"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: { img: ["http", "https", "data"] },
  // relative URLs (internal links, /help/images) are allowed by default
  transformTags: {
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.target === "_blank") out.rel = "noopener noreferrer";
      return { tagName, attribs: out };
    },
  },
};

/**
 * Render a guide section's Markdown → sanitised, safe HTML, with `:sym[type]:`
 * shortcodes swapped for inline diagram-symbol SVGs. Server-side; used by BOTH
 * the live guide and the editor preview (single source of truth).
 */
export function renderHelpMarkdown(md: string): string {
  if (!md) return "";
  // 1. Pull symbol shortcodes out BEFORE markdown/sanitise (the SVG would be
  //    stripped); replace each with an inert token that survives intact.
  const syms: string[] = [];
  const withTokens = md.replace(SYM_RE, (_m, type: string) => {
    const i = syms.push(symbolGlyphSvg(type)) - 1;
    return `@@SYM${i}@@`;
  });
  // 2. Markdown → HTML → sanitise.
  const html = sanitizeHtml(marked.parse(withTokens) as string, SANITIZE);
  // 3. Re-insert the trusted symbol SVGs.
  return html.replace(/@@SYM(\d+)@@/g, (_m, i) => syms[Number(i)] ?? "");
}
