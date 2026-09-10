/**
 * A tiny dependency-free XML scanner, shared by the importers.
 *
 * It lived inside importBpmnXml.ts until the ARIS AML importer needed the same
 * thing. Two copies of a parser is two parsers that drift, and the AML format
 * is exactly where tolerance matters most — a real ARIS export may nest or
 * quote differently from anything we have seen.
 *
 * It is deliberately NOT a DOM: it walks tags tracking bracket depth, which is
 * enough to pull typed children out of a known structure and does not care
 * about the parts of the document it was not asked for.
 */

/** Strip an XML namespace prefix from a tag name. "bpmn:task" → "task". */
export function localName(tag: string): string {
  return tag.replace(/^[a-zA-Z0-9_-]+:/, "");
}

/** Read an attribute value from an open-tag substring. Returns undefined when
 *  the attribute is absent. Tolerates either " or ' quoting. */
export function getAttr(openTag: string, name: string): string | undefined {
  // Anchor on a leading whitespace so we don't match e.g. "isClosed" when
  // asked for "Closed".
  const re = new RegExp(`\\s${name}=["']([^"']*)["']`);
  const m = openTag.match(re);
  return m ? decodeXmlEntities(m[1]) : undefined;
}

export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#13;/g, "\r")
    .replace(/&#xa;/gi, "\n")
    .replace(/&#xd;/gi, "\r")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, "&");
}

export interface ParsedTag {
  /** Open-tag substring including angle brackets, e.g. `<task id="X" name="Y">`. */
  openTag: string;
  /** Local element name with namespace prefix stripped, e.g. `"task"`. */
  local: string;
  /** Body (between open and close tags). Empty string for self-closing tags. */
  body: string;
  /** Span in the source string covering the full element including its
   *  open/close tags. Use this to seek past the element when walking. */
  start: number;
  end: number;
}

/** Find all CHILD elements of `parent` whose local tag name matches one of
 *  `localTagNames`. "Child" here means at depth-1 relative to the parent's
 *  content — nested matches inside a child are not returned (caller can
 *  recurse). Returns matches in document order.
 *
 *  The walker tracks bracket depth so it never returns a tag nested inside
 *  another element of the same name. */
export function findChildren(parent: string, localTagNames: string[]): ParsedTag[] {
  const wanted = new Set(localTagNames);
  const out: ParsedTag[] = [];
  // Generic tag matcher: opens, closes, self-closing.
  // Match either:
  //   <ns:tag ...attrs.../>     (self-closing)
  //   <ns:tag ...attrs...>      (open)
  //   </ns:tag>                 (close)
  const re = /<(\/?)([a-zA-Z_][a-zA-Z0-9._:-]*)((?:\s+[^=\s]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let depth = 0;
  let topLevelStart = -1;
  let topLevelOpenTag = "";
  let topLevelLocal = "";
  let m: RegExpExecArray | null;
  while ((m = re.exec(parent)) !== null) {
    const [full, slash, tag, , selfClose] = m;
    const local = localName(tag);
    if (selfClose === "/") {
      // self-closing
      if (depth === 0 && wanted.has(local)) {
        out.push({
          openTag: full,
          local,
          body: "",
          start: m.index,
          end: m.index + full.length,
        });
      }
      continue;
    }
    if (slash === "/") {
      // close tag
      if (depth === 1 && topLevelStart >= 0 && local === topLevelLocal) {
        if (wanted.has(topLevelLocal)) {
          const end = m.index + full.length;
          out.push({
            openTag: topLevelOpenTag,
            local: topLevelLocal,
            body: parent.slice(topLevelStart + topLevelOpenTag.length, m.index),
            start: topLevelStart,
            end,
          });
        }
        topLevelStart = -1;
      }
      depth--;
      continue;
    }
    // open tag
    if (depth === 0) {
      topLevelStart = m.index;
      topLevelOpenTag = full;
      topLevelLocal = local;
    }
    depth++;
  }
  return out;
}

/** Read the first text-child of an element body, with all child element
 *  tags stripped and HTML entities decoded. Handles `<text>...</text>`
 *  and `<flowNodeRef>...</flowNodeRef>` style nodes. */