/**
 * Lightweight inline-SVG glyphs for the User Guide's `:sym[type]:` shortcode.
 *
 * These are small, recognisable representations of the diagram symbols (NOT the
 * full-fidelity canvas SymbolRenderer — that's a heavy React component). They're
 * generated as trusted SVG strings and injected AFTER sanitisation, so the `type`
 * is restricted to a known allow-set here and the markup is our own.
 */

const W = 20;
const H = 15;
const wrap = (inner: string, title: string) =>
  `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${title}" ` +
  `style="display:inline-block;vertical-align:-2px;margin:0 1px"><title>${title}</title>${inner}</svg>`;

const ST = 'fill="none" stroke="#374151" stroke-width="1.3"';
const FILL = 'fill="#374151"';

// type → svg-inner builder. Falls back to a 2-letter chip for unknown types.
const GLYPHS: Record<string, () => string> = {
  task: () => `<rect x="1.5" y="2.5" width="17" height="10" rx="2.5" ${ST}/>`,
  subprocess: () => `<rect x="1.5" y="2.5" width="17" height="10" rx="2.5" ${ST}/><rect x="8" y="8.5" width="4" height="3" ${ST}/>`,
  "start-event": () => `<circle cx="10" cy="7.5" r="5.5" ${ST}/>`,
  "intermediate-event": () => `<circle cx="10" cy="7.5" r="5.5" ${ST}/><circle cx="10" cy="7.5" r="4" ${ST}/>`,
  "end-event": () => `<circle cx="10" cy="7.5" r="5.5" fill="none" stroke="#374151" stroke-width="2.4"/>`,
  gateway: () => `<path d="M10 1.5 L18 7.5 L10 13.5 L2 7.5 Z" ${ST}/>`,
  "gateway-exclusive": () => `<path d="M10 1.5 L18 7.5 L10 13.5 L2 7.5 Z" ${ST}/><path d="M7.5 5.5 L12.5 9.5 M12.5 5.5 L7.5 9.5" stroke="#374151" stroke-width="1.3"/>`,
  "gateway-parallel": () => `<path d="M10 1.5 L18 7.5 L10 13.5 L2 7.5 Z" ${ST}/><path d="M10 4.5 V10.5 M7 7.5 H13" stroke="#374151" stroke-width="1.3"/>`,
  "gateway-inclusive": () => `<path d="M10 1.5 L18 7.5 L10 13.5 L2 7.5 Z" ${ST}/><circle cx="10" cy="7.5" r="2.5" ${ST}/>`,
  pool: () => `<rect x="1" y="2.5" width="18" height="10" ${ST}/><line x1="4.5" y1="2.5" x2="4.5" y2="12.5" stroke="#374151" stroke-width="1.3"/>`,
  lane: () => `<rect x="1" y="3.5" width="18" height="8" ${ST}/>`,
  "data-object": () => `<path d="M4 2.5 H13 L16 5.5 V12.5 H4 Z M13 2.5 V5.5 H16" ${ST}/>`,
  "data-store": () => `<path d="M3 4 C3 2.5 17 2.5 17 4 V11 C17 12.5 3 12.5 3 11 Z" ${ST}/><path d="M3 4 C3 5.5 17 5.5 17 4" ${ST}/>`,
  actor: () => `<circle cx="10" cy="4" r="2" ${ST}/><path d="M10 6 V10 M6 8 H14 M10 10 L7 13 M10 10 L13 13" ${ST}/>`,
  // Flowchart (ISO 5807)
  "flowchart-process": () => `<rect x="1.5" y="3" width="17" height="9" ${ST}/>`,
  "flowchart-decision": () => `<path d="M10 1.5 L18 7.5 L10 13.5 L2 7.5 Z" ${ST}/>`,
  "flowchart-terminator": () => `<rect x="1.5" y="3.5" width="17" height="8" rx="4" ${ST}/>`,
  "flowchart-io": () => `<path d="M4 3 H18 L16 12 H2 Z" ${ST}/>`,
  "flowchart-document": () => `<path d="M2 3 H18 V11 C14 14 6 8 2 11 Z" ${ST}/>`,
};

const KNOWN = new Set(Object.keys(GLYPHS));

/** True for any type our shortcode accepts (incl. the generic fallback chip). */
export function isKnownSymbol(type: string): boolean {
  return /^[a-z0-9-]{1,40}$/.test(type);
}

/** Inline SVG (trusted) for a `:sym[type]:` shortcode. Unknown-but-valid types
 *  get a small 2-letter chip; invalid input returns the literal escaped text. */
export function symbolGlyphSvg(rawType: string): string {
  const type = String(rawType || "").toLowerCase();
  if (!isKnownSymbol(type)) return ":sym[" + type.replace(/[^a-z0-9-]/g, "") + "]:";
  const label = type.replace(/-/g, " ");
  if (KNOWN.has(type)) return wrap(GLYPHS[type](), label);
  // Generic chip: first letters of the (hyphen-split) type, e.g. "uml-class" → "UC"
  const code = type.split("-").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  return wrap(
    `<rect x="1" y="2" width="18" height="11" rx="2" ${ST}/><text x="10" y="11" text-anchor="middle" font-size="7" ${FILL} font-family="sans-serif">${code}</text>`,
    label,
  );
}
