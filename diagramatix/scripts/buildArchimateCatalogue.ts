/**
 * Phase 1 catalogue pre-processor for ArchiMate 3.1 shapes.
 *
 * Reads .vssx stencils from `new features/Archimate 3,1/` and emits a
 * single JSON catalogue to `public/archimate-catalogue.json`.
 *
 * Scope (this stage): Business, Motivation, Strategy, Application layers +
 * Relationships. Technology / Physical / Implementation / Composite will
 * be added later.
 *
 * Output shape (see types below). Each master shape gets:
 *   - key              — slug derived from the master name
 *   - name             — human-readable name
 *   - description      — from the master's Prompt attribute
 *   - category         — id of the parent stencil category
 *   - defaultWidth/Height  — rounded to sensible px values
 *   - fill             — RAW hex colour extracted from the primary shape
 *   - stroke           — raw stroke hex
 *   - shapeFamily      — classified geometry kind (rectangle, rounded-rect,
 *                        ellipse, hexagon, custom) — used by the renderer
 *                        to pick the outline
 *   - iconType         — derived from the name keyword (actor / role /
 *                        service / function / process / interface / event
 *                        / etc.) — matched to a standard ArchiMate icon
 *                        overlay in the renderer
 *
 * Relationships are emitted separately with line/arrow metadata.
 *
 * Run:   npx tsx scripts/buildArchimateCatalogue.ts
 */

import JSZip from "jszip";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

// ── Sources ──────────────────────────────────────────────────────────
// Run from repo root or from the diagramatix/ app folder — resolve both.
const ROOT = existsSync(join(process.cwd(), "new features")) ? process.cwd()
  : existsSync(join(process.cwd(), "diagramatix", "new features")) ? join(process.cwd(), "diagramatix")
  : process.cwd();
const STENCIL_DIR = join(ROOT, "new features", "Archimate 3,1");
const OUT_FILE = join(ROOT, "public", "archimate-catalogue.json");

interface StencilSource {
  file: string;
  categoryId: string;
  categoryName: string;
}

const STENCILS: StencilSource[] = [
  { file: "ArchiMate 3.1 Business layer.vssx",    categoryId: "business",      categoryName: "Business" },
  { file: "ArchiMate 3.1 Motivation elements.vssx", categoryId: "motivation",  categoryName: "Motivation" },
  { file: "ArchiMate 3.1 Strategy elements.vssx",   categoryId: "strategy",    categoryName: "Strategy" },
  { file: "ArchiMate 3.1 Application layer.vssx",   categoryId: "application", categoryName: "Application" },
];
const REL_STENCIL = "ArchiMate 3.1 Relationships.vssx";

// ── Types ────────────────────────────────────────────────────────────
interface ShapeEntry {
  key: string;
  name: string;
  /** "box" = large rectangle form, "icon" = compact iconic form. */
  variant: "box" | "icon";
  description?: string;
  category: string;
  defaultWidth: number;
  defaultHeight: number;
  fill?: string;
  stroke?: string;
  shapeFamily: "rectangle" | "rounded-rect" | "ellipse" | "hexagon" | "custom";
  iconType?: string;
}

interface RelationshipEntry {
  key: string;
  name: string;
  linePattern: "solid" | "dashed" | "dotted";
  beginArrow: number;
  endArrow: number;
  /** Fill of the begin-arrow head (when Visio supplies it) — open vs filled. */
  beginFilled?: boolean;
  endFilled?: boolean;
}

interface Category {
  id: string;
  name: string;
  shapes: ShapeEntry[];
}

interface Catalogue {
  version: string;
  generatedAt: string;
  categories: Category[];
  relationships: RelationshipEntry[];
}

// ── Visio unit conversion (inches → pixels @ 96 DPI, rounded) ───────
const INCH_TO_PX = 96;
function toPx(val: number): number {
  return Math.round(val * INCH_TO_PX);
}

// ── XML scraping helpers (regex-based; Visio schema is stable) ──────
function cellValue(xml: string, cellName: string): string | undefined {
  const re = new RegExp(`<Cell N='${cellName}'[^/]*?V='([^']*)'`);
  return xml.match(re)?.[1];
}

function attrValue(tag: string, attr: string): string | undefined {
  const re = new RegExp(`${attr}='([^']*)'`);
  return tag.match(re)?.[1];
}

function hexOrUndefined(v: string | undefined): string | undefined {
  if (!v) return undefined;
  // Accept #rrggbb; ignore theme-var references like "THEMEVAL(...)"
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : undefined;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, "")        // strip "(box)", "(bi-dir)" etc.
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Very lightweight classifier — scan the first Geometry section's rows. */
function classifyGeometry(masterXml: string): ShapeEntry["shapeFamily"] {
  // Find the primary shape's first geometry block
  const geomMatch = masterXml.match(/<Section N='Geometry' IX='0'[^>]*>([\s\S]*?)<\/Section>/);
  if (!geomMatch) return "custom";
  const g = geomMatch[1];
  if (/<Row T='Ellipse'/.test(g)) return "ellipse";
  if (/<Row T='RelEllipticalArcTo'/.test(g) || /<Row T='ArcTo'/.test(g)) return "rounded-rect";
  const rel = (g.match(/<Row T='RelLineTo'/g) ?? []).length;
  const move = (g.match(/<Row T='RelMoveTo'/g) ?? []).length;
  if (move === 1 && rel >= 3 && rel <= 5) return "rectangle";
  if (move === 1 && rel === 6) return "hexagon";
  return "custom";
}

/** Match the master name against common ArchiMate element keywords. */
function classifyIcon(name: string): string | undefined {
  const n = name.toLowerCase();
  const kw: Array<[RegExp, string]> = [
    [/\bactor\b/, "actor"],
    [/\brole\b/, "role"],
    [/\bcollaboration\b/, "collaboration"],
    [/\binterface\b/, "interface"],
    [/\bprocess\b/, "process"],
    [/\bfunction\b/, "function"],
    [/\bservice\b/, "service"],
    [/\bevent\b/, "event"],
    [/\binteraction\b/, "interaction"],
    [/\bobject\b/, "object"],
    [/\bcontract\b/, "contract"],
    [/\bproduct\b/, "product"],
    [/\brepresentation\b/, "representation"],
    [/\bcomponent\b/, "component"],
    [/\bapplication\b/, "application-generic"],
    [/\bdata\b/, "data"],
    [/\bstakeholder\b/, "stakeholder"],
    [/\bdriver\b/, "driver"],
    [/\bassessment\b/, "assessment"],
    [/\bgoal\b/, "goal"],
    [/\boutcome\b/, "outcome"],
    [/\bprinciple\b/, "principle"],
    [/\brequirement\b/, "requirement"],
    [/\bconstraint\b/, "constraint"],
    [/\bmeaning\b/, "meaning"],
    [/\bvalue\b/, "value"],
    [/\bresource\b/, "resource"],
    [/\bcapability\b/, "capability"],
    [/\bcourse of action\b/, "course-of-action"],
    [/\bvalue stream\b/, "value-stream"],
    [/\blocation\b/, "location"],
    [/\bgap\b/, "gap"],
    [/\bjunction\b/, "junction"],
    [/\bor junction\b/, "junction-or"],
    [/\band junction\b/, "junction-and"],
  ];
  for (const [re, id] of kw) if (re.test(n)) return id;
  return undefined;
}

// ── Main extractor ──────────────────────────────────────────────────
async function extractStencil(src: StencilSource): Promise<ShapeEntry[]> {
  const path = join(STENCIL_DIR, src.file);
  if (!existsSync(path)) {
    console.warn(`  [skip] missing: ${src.file}`);
    return [];
  }
  const buf = readFileSync(path);
  const zip = await JSZip.loadAsync(buf);

  const mastersXml = await zip.file("visio/masters/masters.xml")!.async("string");
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels")!.async("string");

  // Build rId → Target map up-front (.rels uses double quotes)
  const rIdToTarget = new Map<string, string>();
  const relEntryRe = /<Relationship\s+Id="(rId\d+)"[^>]*?Target="([^"]+)"/g;
  let rm: RegExpExecArray | null;
  while ((rm = relEntryRe.exec(relsXml)) !== null) {
    rIdToTarget.set(rm[1], rm[2]);
  }

  // Parse masters.xml — collect master metadata with its rId
  const shapes: ShapeEntry[] = [];
  const seenKeys = new Set<string>();
  const masterRe = /<Master\s+ID='(\d+)'([^>]*?)>[\s\S]*?<Rel\s+r:id='(rId\d+)'\s*\/>\s*<\/Master>/g;
  let m: RegExpExecArray | null;
  while ((m = masterRe.exec(mastersXml)) !== null) {
    const attrs = m[2];
    const rawName = attrValue(attrs, "NameU") ?? attrValue(attrs, "Name") ?? `Unnamed-${m[1]}`;
    const hidden = attrValue(attrs, "Hidden") === "1";
    if (hidden) continue;
    const prompt = attrValue(attrs, "Prompt");
    // Detect the two ArchiMate shape variants by their name marker:
    //   "Business Actor (box)"  → larger rectangle form
    //   "Business Actor"         → smaller iconic form
    const isBoxVariant = /\(box\)/i.test(rawName);
    const cleanName = rawName
      .replace(/\s*\(box\)\s*$/i, "")   // strip "(box)"
      .replace(/\.\d+$/, "")            // strip ".13" version suffixes
      .trim();
    const variant = isBoxVariant ? "box" : "icon";

    // Resolve rId → file path via the .rels map
    const rId = m[3];
    const target = rIdToTarget.get(rId);
    if (!target) continue;
    const masterFile = target.replace(/^\.\.\//, "");

    const masterContent = await zip.file(`visio/masters/${masterFile.replace(/^masters\//, "")}`)?.async("string")
      ?? await zip.file(`visio/${masterFile}`)?.async("string");
    if (!masterContent) continue;

    // Primary fill = first Shape with a FillForegnd (skip the outer Group that
    // has no geometry). Take the shape whose fill looks like the layer colour.
    const firstShape = masterContent.match(/<Shape[^>]*Type='Shape'[\s\S]*?<\/Shape>/);
    const shapeXml = firstShape?.[0] ?? masterContent;
    const fill = hexOrUndefined(cellValue(shapeXml, "FillForegnd"));
    const stroke = hexOrUndefined(cellValue(shapeXml, "LineColor"));

    // Read the Master's declared page dimensions
    const pageWidthStr = masterContent.match(/<Cell N='PageWidth' V='([0-9.]+)'/)?.[1]
      ?? mastersXml.match(new RegExp(`<Master ID='${m[1]}'[\\s\\S]*?<Cell N='PageWidth' V='([0-9.]+)'`))?.[1];
    const pageHeightStr = masterContent.match(/<Cell N='PageHeight' V='([0-9.]+)'/)?.[1]
      ?? mastersXml.match(new RegExp(`<Master ID='${m[1]}'[\\s\\S]*?<Cell N='PageHeight' V='([0-9.]+)'`))?.[1];
    const wIn = pageWidthStr ? parseFloat(pageWidthStr) : 1.18;
    const hIn = pageHeightStr ? parseFloat(pageHeightStr) : 0.79;

    // Build a unique key — slug + variant suffix; dedupe if still clashes
    let key = slugify(`${src.categoryId}-${cleanName}-${variant}`);
    let dedupe = 2;
    while (seenKeys.has(key)) key = slugify(`${src.categoryId}-${cleanName}-${variant}-${dedupe++}`);
    seenKeys.add(key);

    shapes.push({
      key,
      name: cleanName,
      variant,
      description: prompt,
      category: src.categoryId,
      defaultWidth: toPx(wIn),
      defaultHeight: toPx(hIn),
      fill,
      stroke,
      shapeFamily: classifyGeometry(masterContent),
      iconType: classifyIcon(cleanName),
    });
  }
  return shapes;
}

async function extractRelationships(): Promise<RelationshipEntry[]> {
  const path = join(STENCIL_DIR, REL_STENCIL);
  if (!existsSync(path)) {
    console.warn(`  [skip] missing: ${REL_STENCIL}`);
    return [];
  }
  const buf = readFileSync(path);
  const zip = await JSZip.loadAsync(buf);

  const mastersXml = await zip.file("visio/masters/masters.xml")!.async("string");
  const relsXml = await zip.file("visio/masters/_rels/masters.xml.rels")!.async("string");

  const rIdToTarget = new Map<string, string>();
  const relEntryRe = /<Relationship\s+Id="(rId\d+)"[^>]*?Target="([^"]+)"/g;
  let rm: RegExpExecArray | null;
  while ((rm = relEntryRe.exec(relsXml)) !== null) rIdToTarget.set(rm[1], rm[2]);

  const rels: RelationshipEntry[] = [];
  const masterRe = /<Master\s+ID='(\d+)'([^>]*?)>[\s\S]*?<Rel\s+r:id='(rId\d+)'\s*\/>\s*<\/Master>/g;
  let m: RegExpExecArray | null;
  while ((m = masterRe.exec(mastersXml)) !== null) {
    const attrs = m[2];
    const name = attrValue(attrs, "NameU") ?? attrValue(attrs, "Name") ?? `Unnamed-${m[1]}`;
    const hidden = attrValue(attrs, "Hidden") === "1";
    if (hidden) continue;
    // Skip the invisible "0","1","2" masters in this stencil
    if (/^[012]$/.test(name)) continue;

    const rId = m[3];
    const target = rIdToTarget.get(rId);
    if (!target) continue;
    const fileName = target.replace(/^\.\.\//, "").replace(/^masters\//, "");
    const content = await zip.file(`visio/masters/${fileName}`)?.async("string");
    if (!content) continue;

    const linePatternNum = Number(cellValue(content, "LinePattern") ?? 1);
    const beginArrow = Number(cellValue(content, "BeginArrow") ?? 0);
    const endArrow = Number(cellValue(content, "EndArrow") ?? 0);
    const beginArrowSize = Number(cellValue(content, "BeginArrowSize") ?? 0);
    const endArrowSize = Number(cellValue(content, "EndArrowSize") ?? 0);

    rels.push({
      key: slugify(name),
      name,
      linePattern: linePatternNum === 1 ? "solid" : linePatternNum === 2 ? "dashed" : "dotted",
      beginArrow,
      endArrow,
      beginFilled: beginArrow > 0 && beginArrowSize !== 0 ? true : undefined,
      endFilled: endArrow > 0 && endArrowSize !== 0 ? true : undefined,
    });
  }
  return rels;
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  console.log(`Reading stencils from ${STENCIL_DIR}`);
  const categories: Category[] = [];
  for (const src of STENCILS) {
    process.stdout.write(`  ${src.categoryName}…`);
    const shapes = await extractStencil(src);
    console.log(` ${shapes.length} shape${shapes.length === 1 ? "" : "s"}`);
    categories.push({ id: src.categoryId, name: src.categoryName, shapes });
  }

  process.stdout.write(`  Relationships…`);
  const relationships = await extractRelationships();
  console.log(` ${relationships.length} relationship${relationships.length === 1 ? "" : "s"}`);

  const catalogue: Catalogue = {
    version: "3.1",
    generatedAt: new Date().toISOString(),
    categories,
    relationships,
  };

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, JSON.stringify(catalogue, null, 2), "utf8");
  const bytes = JSON.stringify(catalogue).length;
  console.log(`\nWrote ${OUT_FILE} (${Math.round(bytes / 1024)} KB)`);
  console.log(`  ${categories.reduce((s, c) => s + c.shapes.length, 0)} shapes across ${categories.length} categories`);
  console.log(`  ${relationships.length} relationship types`);
}

main().catch(err => { console.error(err); process.exit(1); });
