/**
 * Process Portal — pure search + facet helpers over the caller's accessible
 * published diagrams. No Prisma, no DOM: the server resolver hands the client a
 * flat list of `PortalRow`s and the client searches/filters/sorts entirely in
 * memory (access-scoped sets are modest). Kept pure so it's unit-testable and
 * usable on either side of the wire.
 */

/** One published process in the Portal index (slim, client-safe). */
export interface PortalRow {
  id: string;
  name: string;
  type: string;                     // "bpmn" | "state-machine" | …
  ownerId: string | null;
  ownerName: string | null;
  projectId: string | null;
  updatedAt: string;                // ISO
  publishedAt: string | null;       // ISO — current published version
  versionNumber: number | null;
  nextReviewDate: string | null;    // ISO
  procedureDocUrl: string | null;
  procedureDocName: string | null;
  pcfHierarchyId: string | null;    // e.g. "8.5.2"
  pcfName: string | null;           // the diagram's own APQC node name
  /** How the caller can see it — for a small provenance chip. */
  via: "project" | "bundle";
}

export type ReviewStatus = "current" | "due-soon" | "overdue" | "none";

/** Window (days) before the review date within which we flag "due soon".
 *  Matches the dashboard PublishedSection badge. */
export const REVIEW_SOON_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Classify a diagram's review state relative to `now` (ms). */
export function reviewStatusOf(nextReviewDate: string | null, now: number): ReviewStatus {
  if (!nextReviewDate) return "none";
  const due = Date.parse(nextReviewDate);
  if (Number.isNaN(due)) return "none";
  if (due <= now) return "overdue";
  if (due - now <= REVIEW_SOON_DAYS * DAY_MS) return "due-soon";
  return "current";
}

/** Top-level APQC category code for a node's hierarchyId ("8.5.2" → "8.0").
 *  Null when the diagram carries no PCF classification. */
export function pcfTopCategory(hierarchyId: string | null): string | null {
  if (!hierarchyId) return null;
  const head = hierarchyId.split(".")[0]?.trim();
  if (!head || !/^\d+$/.test(head)) return null;
  return `${head}.0`;
}

export interface PortalFilter {
  q?: string;
  type?: string;
  ownerId?: string;
  category?: string;               // top-category code, e.g. "8.0"
  review?: ReviewStatus;
  sort?: "name" | "recent";
}

/** Case-insensitive text match across the fields a reader would search by. */
function matchesQuery(r: PortalRow, q: string): boolean {
  const hay = `${r.name}${r.ownerName ?? ""}${r.pcfName ?? ""}${r.type}`.toLowerCase();
  // Every whitespace-separated term must appear (AND semantics).
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

/** Filter + sort the index for the current query/facets. `now` drives review status. */
export function filterRows(rows: PortalRow[], f: PortalFilter, now: number): PortalRow[] {
  const q = (f.q ?? "").trim();
  const out = rows.filter((r) => {
    if (q && !matchesQuery(r, q)) return false;
    if (f.type && r.type !== f.type) return false;
    if (f.ownerId && r.ownerId !== f.ownerId) return false;
    if (f.category && pcfTopCategory(r.pcfHierarchyId) !== f.category) return false;
    if (f.review && reviewStatusOf(r.nextReviewDate, now) !== f.review) return false;
    return true;
  });
  const byRecent = (a: PortalRow, b: PortalRow) =>
    Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt);
  const byName = (a: PortalRow, b: PortalRow) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  out.sort(f.sort === "recent" ? byRecent : byName);
  return out;
}

export interface FacetValue<V = string> { value: V; label: string; count: number }
export interface PortalFacets {
  type: FacetValue[];
  owner: FacetValue[];          // value = ownerId
  category: FacetValue[];       // value = top-category code
  review: FacetValue<ReviewStatus>[];
}

const REVIEW_LABEL: Record<ReviewStatus, string> = {
  current: "Current", "due-soon": "Due soon", overdue: "Overdue", none: "No review set",
};
const REVIEW_ORDER: ReviewStatus[] = ["overdue", "due-soon", "current", "none"];

/** Human label for a diagram type — falls back to a title-cased slug. */
export function typeLabel(type: string): string {
  const known: Record<string, string> = {
    bpmn: "BPMN", "state-machine": "State Machine", archimate: "ArchiMate",
    flowchart: "Flowchart", domain: "Domain", basic: "Basic", "value-chain": "Value Chain",
  };
  return known[type] ?? type.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build the facet buckets from the FULL accessible set (not the filtered view),
 * so counts show what each choice would surface. `categoryLabels` optionally maps
 * a top-category code → its APQC name (from PcfNode); falls back to the code.
 */
export function buildFacets(
  rows: PortalRow[],
  now: number,
  categoryLabels: Record<string, string> = {},
): PortalFacets {
  const bump = <V extends string>(m: Map<V, FacetValue<V>>, value: V, label: string) => {
    const cur = m.get(value);
    if (cur) cur.count++;
    else m.set(value, { value, label, count: 1 });
  };

  const type = new Map<string, FacetValue>();
  const owner = new Map<string, FacetValue>();
  const category = new Map<string, FacetValue>();
  const review = new Map<ReviewStatus, FacetValue<ReviewStatus>>();

  for (const r of rows) {
    bump(type, r.type, typeLabel(r.type));
    if (r.ownerId) bump(owner, r.ownerId, r.ownerName ?? "Unknown");
    const cat = pcfTopCategory(r.pcfHierarchyId);
    if (cat) bump(category, cat, categoryLabels[cat] ?? cat);
    const rs = reviewStatusOf(r.nextReviewDate, now);
    bump(review, rs, REVIEW_LABEL[rs]);
  }

  const byCountThenLabel = (a: FacetValue, b: FacetValue) =>
    b.count - a.count || a.label.localeCompare(b.label);
  const byCategoryCode = (a: FacetValue, b: FacetValue) =>
    (parseInt(a.value, 10) || 0) - (parseInt(b.value, 10) || 0);

  return {
    type: [...type.values()].sort(byCountThenLabel),
    owner: [...owner.values()].sort(byCountThenLabel),
    category: [...category.values()].sort(byCategoryCode),
    review: REVIEW_ORDER.map((s) => review.get(s)).filter((x): x is FacetValue<ReviewStatus> => !!x),
  };
}
