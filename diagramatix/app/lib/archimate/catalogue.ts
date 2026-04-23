/**
 * Runtime loader + typed accessors for the ArchiMate 3.1 shape catalogue.
 *
 * The catalogue JSON is produced offline by `scripts/buildArchimateCatalogue.ts`
 * and shipped in `public/archimate-catalogue.json`. This module loads it
 * once (SSR-safe, via a dynamic import and in-memory cache) and exposes
 * lookup helpers.
 */

export interface ArchimateShapeEntry {
  key: string;
  name: string;
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

export interface ArchimateRelationshipEntry {
  key: string;
  name: string;
  linePattern: "solid" | "dashed" | "dotted";
  beginArrow: number;
  endArrow: number;
  beginFilled?: boolean;
  endFilled?: boolean;
}

export interface ArchimateCategory {
  id: string;
  name: string;
  shapes: ArchimateShapeEntry[];
}

export interface ArchimateCatalogue {
  version: string;
  generatedAt: string;
  categories: ArchimateCategory[];
  relationships: ArchimateRelationshipEntry[];
}

let cache: ArchimateCatalogue | null = null;
let loadingPromise: Promise<ArchimateCatalogue> | null = null;

/** Fetch the catalogue (browser). Cached after first call. */
export async function loadArchimateCatalogue(): Promise<ArchimateCatalogue> {
  if (cache) return cache;
  if (loadingPromise) return loadingPromise;
  loadingPromise = fetch("/archimate-catalogue.json")
    .then(r => {
      if (!r.ok) throw new Error(`archimate-catalogue.json ${r.status}`);
      return r.json();
    })
    .then((c: ArchimateCatalogue) => { cache = c; return c; })
    .finally(() => { loadingPromise = null; });
  return loadingPromise;
}

/** Synchronous accessor once the catalogue is loaded. Returns null if not yet loaded. */
export function getCachedCatalogue(): ArchimateCatalogue | null {
  return cache;
}

/** Look up a shape by its key across all categories. */
export function findShapeByKey(key: string): ArchimateShapeEntry | undefined {
  if (!cache) return undefined;
  for (const cat of cache.categories) {
    const hit = cat.shapes.find(s => s.key === key);
    if (hit) return hit;
  }
  return undefined;
}

/** Look up a relationship by its key. */
export function findRelationshipByKey(key: string): ArchimateRelationshipEntry | undefined {
  return cache?.relationships.find(r => r.key === key);
}
