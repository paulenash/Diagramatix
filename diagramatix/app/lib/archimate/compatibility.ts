/**
 * ArchiMate 3.2 relationship compatibility lookup.
 *
 * Resolves which archi-* relationships are valid between a (source, target)
 * pair, distinguishing between:
 *   - allowed:  permitted directly by the spec
 *   - derived:  reachable via the derivation rules in §5.7
 *   - universal: relationships permitted between any two elements
 *               (Association is the canonical one)
 *
 * The matrix lives in /public/archimate-relationships.json so it can be
 * tweaked without recompiling. This module loads it on first lookup and
 * caches the result.
 */

import type { ArchimateConnectorType } from "@/app/lib/diagram/types";

interface CategoryRule {
  from: string;
  to: string;
  allowed?: ArchimateConnectorType[];
  derived?: ArchimateConnectorType[];
}

interface PairOverride {
  allowed?: ArchimateConnectorType[];
  derived?: ArchimateConnectorType[];
}

interface MatrixData {
  universal: ArchimateConnectorType[];
  selfTypeOnly: ArchimateConnectorType[];
  categories: Record<string, string[]>;
  categoryRules: CategoryRule[];
  overrides: Record<string, Record<string, PairOverride>>;
}

let cached: MatrixData | null = null;
let loadPromise: Promise<MatrixData> | null = null;

export async function loadCompatibilityMatrix(): Promise<MatrixData> {
  if (cached) return cached;
  if (loadPromise) return loadPromise;
  loadPromise = fetch("/archimate-relationships.json")
    .then((r) => {
      if (!r.ok) throw new Error(`relationships matrix HTTP ${r.status}`);
      return r.json();
    })
    .then((data: MatrixData) => {
      cached = data;
      return data;
    });
  return loadPromise;
}

export function getCachedMatrix(): MatrixData | null {
  return cached;
}

function categoryFor(name: string, matrix: MatrixData): string | null {
  for (const [cat, names] of Object.entries(matrix.categories)) {
    if (names.includes(name)) return cat;
  }
  return null;
}

export interface AllowedRelationships {
  allowed: Set<ArchimateConnectorType>;
  derived: Set<ArchimateConnectorType>;
}

/**
 * Resolve the set of relationships permitted between sourceName and
 * targetName. If the matrix isn't loaded yet, returns ALL types as
 * allowed (degraded mode — picker stays usable).
 */
export function getAllowedRelationships(
  sourceName: string | undefined,
  targetName: string | undefined,
): AllowedRelationships {
  const allowed = new Set<ArchimateConnectorType>();
  const derived = new Set<ArchimateConnectorType>();

  if (!cached || !sourceName || !targetName) {
    // Degraded: matrix not loaded or unknown elements. Allow all so the
    // user is never blocked.
    const all: ArchimateConnectorType[] = [
      "archi-composition", "archi-aggregation", "archi-assignment", "archi-realisation",
      "archi-serving", "archi-access", "archi-influence", "archi-association",
      "archi-triggering", "archi-flow", "archi-specialisation",
    ];
    for (const t of all) allowed.add(t);
    return { allowed, derived };
  }

  for (const t of cached.universal) allowed.add(t);

  if (sourceName === targetName) {
    for (const t of cached.selfTypeOnly) allowed.add(t);
  }

  const srcCat = categoryFor(sourceName, cached);
  const tgtCat = categoryFor(targetName, cached);

  if (srcCat && tgtCat) {
    for (const rule of cached.categoryRules) {
      if (rule.from === srcCat && rule.to === tgtCat) {
        for (const t of rule.allowed ?? []) allowed.add(t);
        for (const t of rule.derived ?? []) derived.add(t);
      }
    }
  }

  // Per-pair overrides — additive on top of category rules.
  const pairOverride = cached.overrides[sourceName]?.[targetName];
  if (pairOverride) {
    for (const t of pairOverride.allowed ?? []) allowed.add(t);
    for (const t of pairOverride.derived ?? []) derived.add(t);
  }

  // Anything in `allowed` should not also appear in `derived`.
  for (const t of allowed) derived.delete(t);

  return { allowed, derived };
}
