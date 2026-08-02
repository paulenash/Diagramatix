/**
 * Build a Word `.docx` from a Document-Editor collection (User Guide / Technical
 * Design Notes). Each chapter → a Heading 1; each section heading → Heading 2; the
 * section's GFM Markdown body is walked token-by-token (via `marked.lexer`) into
 * WordprocessingML primitives from the `docx` library.
 *
 * Images (`HelpImage` bytes, referenced as /api/help/images/<id> or data: URIs)
 * are resolved by an optional async `imageResolver` the caller supplies (the
 * export route reads them from the DB). `:sym[type]:` symbol shortcodes render as
 * their label text — inline SVG glyphs aren't practical in Word.
 *
 * Pure apart from the injected resolver — unit-tested by unzipping the result.
 */
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink,
  Table, TableRow, TableCell, WidthType, ImageRun, AlignmentType, BorderStyle,
  PageOrientation, type ISectionOptions,
} from "docx";
import { marked, type Token, type Tokens } from "marked";

export interface DocxSection {
  heading: string | null;
  bodyMarkdown: string;
  image?: string | null;
  imageAlt?: string | null;
  imageCaption?: string | null;
}
export interface DocxChapter { title: string; sections: DocxSection[] }

export type ResolvedImage = { data: Buffer | Uint8Array; width: number; height: number; type: "png" | "jpg" | "gif" | "bmp" };
export interface BuildDocxOpts {
  docTitle: string;
  /** Resolve an image URL to bytes + dimensions; return null to skip it. */
  imageResolver?: (url: string) => Promise<ResolvedImage | null>;
  /** Raw `word/styles.xml` from an org's uploaded Word template. When present it
   *  REPLACES the built-in styles so the export adopts the template's fonts +
   *  heading styles (style/brand adoption). */
  externalStyles?: string;
  /** A key figure (e.g. an SOP diagram) to render on its OWN page(s), never
   *  compressed: a portrait page with very small side margins so it's as large as
   *  possible, plus a landscape page with an expanded copy — both aspect-preserved. */
  figure?: { dataUri: string; caption?: string };
}

const SYM = /:sym\[([^\]]+)\]:/g;           // strip symbol shortcodes to their label
const stripSym = (s: string) => s.replace(SYM, "$1");
const MAX_IMG_W = 600;                        // cap image width (px) for the page

/** Inline tokens → docx runs (bold/italic/code/link), recursively. */
function inlineRuns(tokens: Token[] | undefined, opts: { bold?: boolean; italics?: boolean; code?: boolean } = {}): (TextRun | ExternalHyperlink)[] {
  const out: (TextRun | ExternalHyperlink)[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong": out.push(...inlineRuns((t as Tokens.Strong).tokens, { ...opts, bold: true })); break;
      case "em": out.push(...inlineRuns((t as Tokens.Em).tokens, { ...opts, italics: true })); break;
      case "del": out.push(...inlineRuns((t as Tokens.Del).tokens, opts)); break;
      case "codespan": out.push(new TextRun({ text: stripSym((t as Tokens.Codespan).text), font: "Consolas", ...opts })); break;
      case "link": {
        const lk = t as Tokens.Link;
        out.push(new ExternalHyperlink({ link: lk.href, children: inlineRuns(lk.tokens, opts).filter((r): r is TextRun => r instanceof TextRun).map((r) => r) }));
        break;
      }
      case "br": out.push(new TextRun({ text: "", break: 1 })); break;
      case "image": out.push(new TextRun({ text: stripSym((t as Tokens.Image).text || (t as Tokens.Image).href), italics: true })); break;
      default: {
        const raw = (t as Tokens.Text).text ?? "";
        const sub = (t as Tokens.Text).tokens;
        if (sub && sub.length) out.push(...inlineRuns(sub, opts));
        else out.push(new TextRun({ text: stripSym(raw), ...opts }));
      }
    }
  }
  return out.length ? out : [new TextRun({ text: "" })];
}

const HEADING_BY_DEPTH = [HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

async function blockToChildren(token: Token, resolver?: BuildDocxOpts["imageResolver"]): Promise<(Paragraph | Table)[]> {
  switch (token.type) {
    case "heading": {
      const h = token as Tokens.Heading;
      // Body headings start at H2 (chapter title owns H1) — clamp depth 1→H2, etc.
      return [new Paragraph({ heading: HEADING_BY_DEPTH[Math.min(h.depth, 6) - 1] ?? HeadingLevel.HEADING_4, children: inlineRuns(h.tokens) })];
    }
    case "paragraph": {
      const p = token as Tokens.Paragraph;
      // A paragraph that is nothing but an image → embed it.
      const only = p.tokens?.length === 1 ? p.tokens[0] : null;
      if (only && only.type === "image" && resolver) {
        const img = await embedImage((only as Tokens.Image).href, resolver, (only as Tokens.Image).text);
        if (img) return img;
      }
      return [new Paragraph({ children: inlineRuns(p.tokens), spacing: { after: 120 } })];
    }
    case "list": {
      const l = token as Tokens.List;
      return l.items.map((it, i) => {
        const runs = inlineRuns((it.tokens?.find((x) => x.type === "text" || x.type === "paragraph") as Tokens.Text | undefined)?.tokens ?? it.tokens);
        return new Paragraph({
          children: l.ordered ? [new TextRun({ text: `${(Number(l.start) || 1) + i}. ` }), ...runs] : runs,
          ...(l.ordered ? { indent: { left: 360 } } : { bullet: { level: 0 } }),
          spacing: { after: 40 },
        });
      });
    }
    case "code": {
      const c = token as Tokens.Code;
      return c.text.split("\n").map((line) => new Paragraph({
        children: [new TextRun({ text: line || " ", font: "Consolas", size: 18 })],
        shading: { fill: "F2F2F2", type: "clear", color: "auto" }, spacing: { after: 0 },
      }));
    }
    case "blockquote": {
      const bq = token as Tokens.Blockquote;
      const out: (Paragraph | Table)[] = [];
      for (const inner of bq.tokens) {
        if (inner.type === "paragraph") {
          out.push(new Paragraph({
            children: inlineRuns((inner as Tokens.Paragraph).tokens),
            indent: { left: 480 }, spacing: { after: 80 },
            border: { left: { style: BorderStyle.SINGLE, size: 18, color: "CCCCCC", space: 12 } },
          }));
        } else {
          out.push(...(await blockToChildren(inner, resolver)));
        }
      }
      return out;
    }
    case "table": {
      const tb = token as Tokens.Table;
      const headerRow = new TableRow({
        tableHeader: true,
        children: tb.header.map((cell) => new TableCell({ children: [new Paragraph({ children: inlineRuns(cell.tokens), spacing: { after: 0 } })], shading: { fill: "EFEFEF", type: "clear", color: "auto" } })),
      });
      const bodyRows = tb.rows.map((row) => new TableRow({
        children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: inlineRuns(cell.tokens), spacing: { after: 0 } })] })),
      }));
      return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] })];
    }
    case "hr": return [new Paragraph({ text: "", border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "CCCCCC", space: 1 } } })];
    case "space": return [];
    default: {
      const raw = (token as Tokens.Generic).raw ?? "";
      return raw.trim() ? [new Paragraph({ children: [new TextRun({ text: stripSym(raw.trim()) })] })] : [];
    }
  }
}

async function embedImage(url: string, resolver: NonNullable<BuildDocxOpts["imageResolver"]>, caption?: string): Promise<Paragraph[] | null> {
  const img = await resolver(url).catch(() => null);
  if (!img) return null;
  const scale = img.width > MAX_IMG_W ? MAX_IMG_W / img.width : 1;
  const out: Paragraph[] = [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new ImageRun({ data: img.data, type: img.type, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
  })];
  if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: stripSym(caption), italics: true, size: 18, color: "666666" })], spacing: { after: 120 } }));
  return out;
}

// Letter page in twips (1in = 1440 twips); px assumes 96 DPI (docx image units).
const PAGE_W = 12240, PAGE_H = 15840;
const twToPx = (tw: number) => Math.round((tw / 1440) * 96);

/** A whole-page section showing one figure as large as possible without distortion
 *  (aspect ratio preserved), with small margins. Portrait or landscape. */
async function figurePageSection(
  figure: { dataUri: string; caption?: string },
  resolver: NonNullable<BuildDocxOpts["imageResolver"]>,
  orientation: "portrait" | "landscape",
  heading: string,
  leading: Paragraph[] = [],
): Promise<ISectionOptions | null> {
  const img = await resolver(figure.dataUri).catch(() => null);
  if (!img || !img.width || !img.height) return null;
  const landscape = orientation === "landscape";
  // Effective (on-page) dimensions AFTER orientation, used only for the fit math.
  const effW = landscape ? PAGE_H : PAGE_W;
  const effH = landscape ? PAGE_W : PAGE_H;
  const mSide = 360;                                  // ~0.25in side margins — as wide as sensible
  const mTopBottom = landscape ? 360 : 720;
  const usableW = twToPx(effW - 2 * mSide);
  const usableH = twToPx(effH - 2 * mTopBottom) - 48; // leave room for the heading line
  const scale = Math.min(usableW / img.width, usableH / img.height); // fit, keep aspect
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  return {
    properties: {
      page: {
        // IMPORTANT: docx swaps width/height ITSELF when orientation is landscape.
        // So always pass PORTRAIT dimensions here — passing pre-swapped dims makes it
        // double-swap back to portrait (the bug that showed the expanded page upright).
        size: { orientation: landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT, width: PAGE_W, height: PAGE_H },
        margin: { top: mTopBottom, bottom: mTopBottom, left: mSide, right: mSide },
      },
    },
    children: [
      ...leading,
      // Figure label with EXPLICIT run formatting (bold, sized, dark) rather than
      // the Heading1 STYLE — an org Word template (externalStyles) can define
      // Heading1 so its text renders invisibly, which hid this label. Direct run
      // properties override the style, so "Process Diagram" always shows.
      new Paragraph({ children: [new TextRun({ text: heading, bold: true, size: 28, color: "1F2937" })], spacing: { before: 60, after: 120 } }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: img.data, type: img.type, transformation: { width: w, height: h } })] }),
      ...(figure.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: stripSym(figure.caption), italics: true, size: 18, color: "666666" })] })] : []),
    ],
  };
}

export async function buildDocx(chapters: DocxChapter[], opts: BuildDocxOpts): Promise<Buffer> {
  const titlePara = new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: opts.docTitle })] });
  // Body content (chapters only). When a figure leads the document, the title rides
  // on the figure page; otherwise it heads the content section.
  const children: (Paragraph | Table)[] = [];

  for (let ci = 0; ci < chapters.length; ci++) {
    const c = chapters[ci];
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: `${ci + 1}. ${c.title}` })], spacing: { before: 240, after: 120 } }));
    for (const s of c.sections) {
      if (s.heading) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: s.heading })], spacing: { before: 160, after: 80 } }));
      if (s.bodyMarkdown?.trim()) {
        const tokens = marked.lexer(s.bodyMarkdown);
        for (const t of tokens) children.push(...(await blockToChildren(t, opts.imageResolver)));
      }
      // Section-level image (the HelpSection.image field).
      if (s.image && opts.imageResolver) {
        const img = await embedImage(s.image, opts.imageResolver, s.imageCaption ?? s.imageAlt ?? undefined);
        if (img) children.push(...img);
      }
    }
  }

  // Section order: the Process Diagram leads (portrait, small margins → large, with
  // the document title), then the text content, then the Expanded copy (landscape)
  // at the very end.
  const sections: ISectionOptions[] = [];
  if (opts.figure && opts.imageResolver) {
    const portrait = await figurePageSection(opts.figure, opts.imageResolver, "portrait", "Process Diagram", [titlePara]);
    if (portrait) sections.push(portrait); else children.unshift(titlePara);
    sections.push({ children });
    const landscape = await figurePageSection(opts.figure, opts.imageResolver, "landscape", "Process Diagram — Expanded");
    if (landscape) sections.push(landscape);
  } else {
    sections.push({ children: [titlePara, ...children] });
  }

  const doc = opts.externalStyles
    ? new Document({ externalStyles: opts.externalStyles, sections })
    : new Document({
        styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
        sections,
      });
  return Packer.toBuffer(doc);
}
