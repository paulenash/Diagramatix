/**
 * ArchiMate 3.2 relationship compatibility lookup.
 *
 * Resolves which archi-* relationships 3.2 PERMITS between an ordered (source,
 * target) element pair. The matrix in /public/archimate-relationships.json is
 * generated verbatim from the authoritative ArchiMate 3.2 workbook (Open Group
 * reference cards + Archi's 62×62 matrix) by scripts/gen-archimate-relationships.ts.
 *
 * The spec's permitted set is derivation-inclusive — it does NOT distinguish a
 * "direct" relationship from a "derived" one — so the picker highlights exactly
 * this set (single tier: everything permitted is directly pickable). `derived`
 * is kept on the return type (always empty) so the picker's shape is unchanged.
 */

import type { ArchimateConnectorType } from "@/app/lib/diagram/types";

interface MatrixData {
  version: string;
  elements: string[];
  /** Permitted between ANY two elements (Association, directed + undirected). */
  universal: ArchimateConnectorType[];
  /** permitted[source][target] = every relationship 3.2 permits for that pair. */
  permitted: Record<string, Record<string, ArchimateConnectorType[]>>;
}

const ALL_TYPES: ArchimateConnectorType[] = [
  "archi-composition", "archi-aggregation", "archi-assignment", "archi-realisation",
  "archi-serving", "archi-access", "archi-influence", "archi-association",
  "archi-association-directed", "archi-triggering", "archi-flow", "archi-specialisation",
];

// And/Or junctions are notation nodes, not elements, so they're absent from the
// 3.2 matrix. Per spec a junction splits/joins relationships: Composition,
// Aggregation, Realisation and every directed relationship may connect to a
// junction (in either direction). We therefore allow every relationship type
// when either endpoint is a junction — the picker never blocks a junction wiring.
// Names match the catalogue masters `composite-junction-and/-or`.
const JUNCTION_NAMES = new Set<string>(["And-Junction", "Or-Junction"]);

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

export interface AllowedRelationships {
  /** Everything 3.2 permits between the pair — all directly pickable. */
  allowed: Set<ArchimateConnectorType>;
  /** Retained for API stability; always empty (single-tier model). */
  derived: Set<ArchimateConnectorType>;
}

/**
 * Resolve the relationships permitted between `sourceName` and `targetName`.
 * If the matrix isn't loaded yet, or an element isn't in it, returns ALL types
 * as allowed (degraded mode — the picker never blocks the user).
 */
export function getAllowedRelationships(
  sourceName: string | undefined,
  targetName: string | undefined,
): AllowedRelationships {
  const allowed = new Set<ArchimateConnectorType>();
  const derived = new Set<ArchimateConnectorType>();

  if (!cached || !sourceName || !targetName) {
    for (const t of ALL_TYPES) allowed.add(t);
    return { allowed, derived };
  }

  // A junction at either end permits every relationship type (see JUNCTION_NAMES).
  if (JUNCTION_NAMES.has(sourceName) || JUNCTION_NAMES.has(targetName)) {
    for (const t of ALL_TYPES) allowed.add(t);
    return { allowed, derived };
  }

  // Association is universal; add it up front (also covers a pair absent from
  // the matrix, e.g. an unknown element name → still permits Association).
  for (const t of cached.universal) allowed.add(t);

  const pair = cached.permitted[sourceName]?.[targetName];
  if (pair) {
    for (const t of pair) allowed.add(t);
  } else if (!(sourceName in cached.permitted)) {
    // Unknown source element → degrade to allow-all so the picker stays usable.
    for (const t of ALL_TYPES) allowed.add(t);
  }

  return { allowed, derived };
}
