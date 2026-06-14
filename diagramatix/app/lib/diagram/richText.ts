/**
 * Tiny rich-text helpers for Process descriptions in Value Chain diagrams.
 *
 * Descriptions are stored as a restricted HTML subset produced by a
 * contentEditable editor (bold / italic / underline + ordered / unordered
 * lists). We sanitise to a strict tag whitelist with NO attributes so the
 * stored/rendered HTML can never carry scripts, event handlers, styles, or
 * links — safe to render via dangerouslySetInnerHTML even in a shared /
 * review viewer.
 */

// Inline + block formatting tags we allow. Everything else is unwrapped
// (its text kept) or dropped.
const ALLOWED_TAGS = new Set([
  "b", "strong", "i", "em", "u", "br", "p", "div", "ul", "ol", "li", "span",
]);

/** True when the string looks like our rich HTML (contains a tag). */
export function isRichText(s: string | undefined | null): boolean {
  return !!s && /<\/?[a-z][\s\S]*>/i.test(s);
}

/** Escape plain text for safe HTML embedding. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Convert a legacy plain-text description (with \n line breaks) to HTML. */
export function plainToHtml(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

/**
 * Sanitise a contentEditable HTML fragment to the allowed-tag whitelist,
 * stripping ALL attributes. Implemented with a DOM walk when `document` is
 * available (the editor runs client-side); falls back to a conservative
 * regex strip on the server.
 */
export function sanitizeRichText(html: string): string {
  if (typeof document === "undefined") {
    // Server fallback: drop any tag not in the whitelist and strip every
    // attribute from the survivors.
    return html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (m, tag: string) => {
      const t = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(t)) return "";
      return m.startsWith("</") ? `</${t}>` : `<${t}>`;
    });
  }
  const tpl = document.createElement("div");
  tpl.innerHTML = html;
  const walk = (node: Node): string => {
    let out = "";
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += escapeHtml(child.textContent ?? "");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        const tag = el.tagName.toLowerCase();
        const inner = walk(el);
        if (tag === "br") out += "<br>";
        else if (ALLOWED_TAGS.has(tag)) out += `<${tag}>${inner}</${tag}>`;
        else out += inner; // unknown tag — keep its text only
      }
    });
    return out;
  };
  return walk(tpl).trim();
}
