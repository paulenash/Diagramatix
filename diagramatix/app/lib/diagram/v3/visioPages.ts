/**
 * Visio .vsdx page enumeration — shared between the bulk-import API and
 * the project-detail client dialog so both see the same page list.
 *
 * Pure JS (JSZip only), runs in both Node and the browser.
 */
import JSZip from "jszip";

export interface VisioPage {
  /** 0-based index in document order (matches `<Page>` order in pages.xml). */
  index: number;
  /** Human-readable page name from the `Name` (or `NameU`) attribute.
   *  Falls back to `Page-{index+1}` if neither attribute is present. */
  name: string;
  /** Physical filename inside the .vsdx zip (e.g. "page1.xml"). Resolved
   *  via `visio/pages/_rels/pages.xml.rels`. */
  fileName: string;
}

/** Parse pages.xml + pages.xml.rels and return the ordered list of pages.
 *  Background pages — `<Page Background='1'>` — are excluded from the
 *  result since users don't import them as standalone diagrams.
 *
 *  Returns an empty array if pages.xml is missing or unreadable. */
export async function listVisioPages(buffer: ArrayBuffer): Promise<VisioPage[]> {
  const zip = await JSZip.loadAsync(buffer);
  const pagesXml = await zip.file("visio/pages/pages.xml")?.async("string");
  if (!pagesXml) return [];
  const relsXml =
    (await zip.file("visio/pages/_rels/pages.xml.rels")?.async("string")) ?? "";

  // Build rId → Target map from the rels file. .vsdx uses single-quoted
  // attributes inconsistently with double, so accept either.
  const relMap = new Map<string, string>();
  const relRe = /<Relationship\b[^>]*\bId=["']([^"']+)["'][^>]*\bTarget=["']([^"']+)["']/g;
  for (const m of relsXml.matchAll(relRe)) {
    relMap.set(m[1], m[2]);
  }

  // Walk each <Page ... > ... </Page> block in document order.
  const pages: VisioPage[] = [];
  const pageBlockRe = /<Page\b[^>]*>[\s\S]*?<\/Page>/g;
  let idx = 0;
  for (const blockMatch of pagesXml.matchAll(pageBlockRe)) {
    const block = blockMatch[0];
    // Skip background pages — they exist to be referenced by foreground
    // pages but aren't themselves user-facing diagrams.
    if (/\bBackground=["']1["']/.test(block)) continue;
    const nameMatch = block.match(/\bName=["']([^"']*)["']/);
    const nameUMatch = block.match(/\bNameU=["']([^"']*)["']/);
    const relIdMatch = block.match(/<Rel\b[^>]*\br:id=["']([^"']+)["']/);
    const rawName = nameMatch?.[1] ?? nameUMatch?.[1] ?? `Page-${idx + 1}`;
    const fileName = relIdMatch ? (relMap.get(relIdMatch[1]) ?? `page${idx + 1}.xml`) : `page${idx + 1}.xml`;
    pages.push({ index: idx, name: rawName.trim() || `Page-${idx + 1}`, fileName });
    idx++;
  }
  return pages;
}
