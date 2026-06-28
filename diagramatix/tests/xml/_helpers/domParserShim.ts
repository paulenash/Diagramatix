/**
 * Minimal DOMParser shim for the Node test environment.
 *
 * `parseDiagramatixXml` (app/lib/diagram/xmlExport.ts) is browser-only: it calls
 * `new DOMParser().parseFromString(...)` and walks the result via a small slice
 * of the DOM API — documentElement, localName, children, getAttribute,
 * textContent, querySelector("parsererror"). Vitest runs in a `node`
 * environment with no DOMParser, and the brief forbids adding a dependency.
 *
 * This wraps htmlparser2 (already installed transitively, XML mode) in just
 * enough of that DOM surface so the REAL parseDiagramatixXml runs unmodified.
 * It is a TEST AID only — not production code, not a general DOM.
 */
import { parseDocument } from "htmlparser2";
import { textContent as duText } from "domutils";
import type { Element as HElement, Document as HDocument, AnyNode } from "domhandler";
import { isTag } from "domhandler";

/** Wrap a domhandler element in the DOM-ish surface parseDiagramatixXml needs. */
class ElementShim {
  constructor(private node: HElement) {}

  get localName(): string {
    // htmlparser2 keeps the full "dgx:element" in .name; DOM localName is the
    // part after the prefix. parseDiagramatixXml compares against localName.
    const n = this.node.name;
    const i = n.indexOf(":");
    return i >= 0 ? n.slice(i + 1) : n;
  }

  get children(): ElementShim[] {
    return (this.node.children as AnyNode[])
      .filter(isTag)
      .map((c) => new ElementShim(c as HElement));
  }

  getAttribute(name: string): string | null {
    const attribs = this.node.attribs ?? {};
    if (name in attribs) return attribs[name];
    // Be namespace-prefix tolerant the way a real DOM getAttribute on a
    // prefixed doc usually is not — but the exporter writes plain attr names,
    // so a direct hit is the normal path.
    return null;
  }

  get textContent(): string {
    return duText(this.node);
  }
}

class DocumentShim {
  constructor(private root: HElement | null, private parseError: string | null) {}

  querySelector(sel: string): { textContent: string } | null {
    if (sel === "parsererror" && this.parseError) {
      return { textContent: this.parseError };
    }
    return null;
  }

  get documentElement(): ElementShim | null {
    return this.root ? new ElementShim(this.root) : null;
  }
}

export class DOMParserShim {
  parseFromString(xml: string, _type: string): DocumentShim {
    let doc: HDocument;
    try {
      doc = parseDocument(xml, { xmlMode: true });
    } catch (e) {
      return new DocumentShim(null, String(e));
    }
    const root = (doc.children as AnyNode[]).find(isTag) as HElement | undefined;
    if (!root) return new DocumentShim(null, "no root element");
    return new DocumentShim(root, null);
  }
}

/** Install the shim onto globalThis for the duration of the test file. Returns
 *  a restore() that removes it again. */
export function installDomParser(): () => void {
  const g = globalThis as unknown as { DOMParser?: unknown };
  const had = "DOMParser" in g;
  const prev = g.DOMParser;
  g.DOMParser = DOMParserShim;
  return () => {
    if (had) g.DOMParser = prev;
    else delete g.DOMParser;
  };
}
