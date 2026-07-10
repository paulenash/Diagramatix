"use client";

/**
 * Process Portal — client search/browse over the accessible published index.
 * Search-first: a prominent query box plus facet chips (type / owner / APQC
 * category / review status) and A–Z ↔ recent sort, all applied in memory via
 * the pure helpers in app/lib/portal/facets. Cards link to /processes/[id].
 */
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";
import { APQC_ATTRIBUTION } from "@/app/lib/pcf/attribution";
import {
  filterRows, reviewStatusOf, pcfTopCategory,
  type PortalRow, type PortalFacets, type PortalFilter, type ReviewStatus, type FacetValue,
} from "@/app/lib/portal/facets";
import {
  buildEntityCatalog, resolveEntities, buildEntityFacets, matchesEntityValue, involvesMe,
  type CatalogNodeInput,
} from "@/app/lib/portal/entityIndex";

const REVIEW_PILL: Record<ReviewStatus, { label: string; cls: string } | null> = {
  overdue: { label: "Review overdue", cls: "bg-red-50 text-red-700 border-red-300" },
  "due-soon": { label: "Review due soon", cls: "bg-orange-50 text-orange-700 border-orange-300" },
  current: { label: "Reviewed", cls: "bg-green-50 text-green-700 border-green-300" },
  none: null,
};

const RECENT_KEY = "dgx.portalRecent";

function rememberViewed(id: string) {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* ignore */ }
}

export function PortalClient({ rows, facets, catalog, myTeamIds }: {
  rows: PortalRow[]; facets: PortalFacets; catalog: CatalogNodeInput[]; myTeamIds: string[];
}) {
  const [now] = useState(() => Date.now());
  const [filter, setFilter] = useState<PortalFilter>({ sort: "name" });
  const [recentIds, setRecentIds] = useState<string[]>([]);

  useEffect(() => {
    try { setRecentIds(JSON.parse(localStorage.getItem(RECENT_KEY) || "[]")); } catch { /* ignore */ }
  }, []);

  // Canonicalise each row's raw entity labels against the Org Entity Lists once.
  const cat = useMemo(() => buildEntityCatalog(catalog), [catalog]);
  const resolvedById = useMemo(
    () => new Map(rows.map((r) => [r.id, resolveEntities(r.entityRefs, cat)])),
    [rows, cat],
  );
  const entityFacets = useMemo(
    () => buildEntityFacets([...resolvedById.values()], cat),
    [resolvedById, cat],
  );

  const results = useMemo(() => {
    const base = filterRows(rows, filter, now);
    if (!filter.system && !filter.team && !filter.participant && !filter.involvingMe) return base;
    return base.filter((r) => {
      const res = resolvedById.get(r.id)!;
      if (!matchesEntityValue(res, "system", filter.system)) return false;
      if (!matchesEntityValue(res, "team", filter.team)) return false;
      if (!matchesEntityValue(res, "participant", filter.participant)) return false;
      if (filter.involvingMe && !involvesMe(res, myTeamIds)) return false;
      return true;
    });
  }, [rows, filter, now, resolvedById, myTeamIds]);

  const hasQueryOrFacet = !!(filter.q || filter.type || filter.ownerId || filter.category || filter.review
    || filter.system || filter.team || filter.participant || filter.involvingMe);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const recent = recentIds.map((id) => byId.get(id)).filter((r): r is PortalRow => !!r).slice(0, 4);
  const recentlyUpdated = useMemo(
    () => [...rows].sort((a, b) => Date.parse(b.publishedAt ?? b.updatedAt) - Date.parse(a.publishedAt ?? a.updatedAt)).slice(0, 4),
    [rows],
  );
  const showsPcf = rows.some((r) => r.pcfName);

  // Toggle a single-value facet (click active chip again to clear).
  const toggle = (key: keyof PortalFilter, value: string) =>
    setFilter((f) => ({ ...f, [key]: f[key] === value ? undefined : value }));

  return (
    <div className="dgx-dashboard-bg min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-gray-400 hover:text-gray-700 text-sm">← Dashboard</Link>
          <h1 className="text-lg font-semibold text-gray-800">Process Portal</h1>
          <span className="text-xs text-gray-400">{rows.length} published process{rows.length === 1 ? "" : "es"} you can access</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Hero search */}
        <div className="mb-6">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">🔎</span>
            <input
              autoFocus
              value={filter.q ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
              placeholder="Search processes — name, owner, APQC, system or team…"
              className="w-full pl-10 pr-4 py-3 rounded-lg border border-gray-300 bg-white text-gray-800 shadow-sm focus:border-blue-400 focus:ring-2 focus:ring-blue-100 outline-none"
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No published processes yet"
            body="When you (or someone who shares with you) publish a diagram or a bundle, it will appear here for easy browsing and search."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
            {/* Facet rail */}
            <aside className="space-y-5">
              {myTeamIds.length > 0 && (
                <button
                  onClick={() => setFilter((f) => ({ ...f, involvingMe: !f.involvingMe }))}
                  className={`w-full text-left text-sm font-medium rounded px-3 py-2 border ${filter.involvingMe ? "bg-blue-600 text-white border-blue-600" : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"}`}
                  title="Processes that reference a team or role you belong to"
                >
                  👤 Involving me
                </button>
              )}
              {entityFacets.system.length > 0 && (
                <FacetGroup title="IT System" values={entityFacets.system} active={filter.system} onPick={(v) => toggle("system", v)} />
              )}
              {entityFacets.team.length > 0 && (
                <FacetGroup title="Team / Role" values={entityFacets.team} active={filter.team} onPick={(v) => toggle("team", v)} />
              )}
              {entityFacets.participant.length > 0 && (
                <FacetGroup title="External Participant" values={entityFacets.participant} active={filter.participant} onPick={(v) => toggle("participant", v)} />
              )}
              <FacetGroup title="Type" values={facets.type} active={filter.type} onPick={(v) => toggle("type", v)} />
              <FacetGroup title="Owner" values={facets.owner} active={filter.ownerId} onPick={(v) => toggle("ownerId", v)} />
              {facets.category.length > 0 && (
                <FacetGroup title="APQC category" values={facets.category} active={filter.category} onPick={(v) => toggle("category", v)} />
              )}
              <FacetGroup title="Review" values={facets.review} active={filter.review} onPick={(v) => toggle("review", v as ReviewStatus)} />
            </aside>

            {/* Results */}
            <main>
              {/* Home strips — only when the reader hasn't started searching/filtering */}
              {!hasQueryOrFacet && (
                <>
                  {recent.length > 0 && <Strip title="Recently viewed" rows={recent} now={now} onOpen={rememberViewed} />}
                  <Strip title="Recently updated" rows={recentlyUpdated} now={now} onOpen={rememberViewed} />
                  <div className="border-t border-gray-200 my-5" />
                </>
              )}

              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-500">
                  {results.length} result{results.length === 1 ? "" : "s"}
                  {hasQueryOrFacet && <button onClick={() => setFilter({ sort: filter.sort })} className="ml-2 text-blue-600 hover:underline">clear filters</button>}
                </p>
                <div className="flex items-center gap-1 text-xs">
                  <span className="text-gray-400">Sort</span>
                  <button onClick={() => setFilter((f) => ({ ...f, sort: "name" }))} className={`px-2 py-0.5 rounded ${filter.sort !== "recent" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>A–Z</button>
                  <button onClick={() => setFilter((f) => ({ ...f, sort: "recent" }))} className={`px-2 py-0.5 rounded ${filter.sort === "recent" ? "bg-blue-50 text-blue-700" : "text-gray-500 hover:bg-gray-100"}`}>Recent</button>
                </div>
              </div>

              {results.length === 0 ? (
                <EmptyState title="No matches" body="Try a different search term or clear a filter." />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {results.map((r) => <ProcessCard key={r.id} row={r} now={now} onOpen={rememberViewed} />)}
                </div>
              )}
            </main>
          </div>
        )}

        {showsPcf && <p className="mt-8 text-[10px] text-gray-400 leading-relaxed">{APQC_ATTRIBUTION}</p>}
      </div>
    </div>
  );
}

function FacetGroup<V extends string>({ title, values, active, onPick }: {
  title: string; values: FacetValue<V>[]; active?: V; onPick: (v: V) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">{title}</p>
      <div className="space-y-0.5">
        {values.map((v) => (
          <button
            key={v.value}
            onClick={() => onPick(v.value)}
            title={v.uncatalogued ? `"${v.label}" is not in your Entity Lists` : undefined}
            className={`w-full flex items-center justify-between text-left text-sm px-2 py-1 rounded ${active === v.value ? "bg-blue-100 text-blue-800 font-medium" : "text-gray-700 hover:bg-gray-100"}`}
          >
            <span className={`truncate ${v.uncatalogued ? "italic text-gray-400" : ""}`}>{v.label}{v.uncatalogued && <span className="ml-1 not-italic">•</span>}</span>
            <span className={`ml-2 text-xs ${active === v.value ? "text-blue-600" : "text-gray-400"}`}>{v.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Strip({ title, rows, now, onOpen }: { title: string; rows: PortalRow[]; now: number; onOpen: (id: string) => void }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {rows.map((r) => <ProcessCard key={r.id} row={r} now={now} onOpen={onOpen} compact />)}
      </div>
    </div>
  );
}

function ProcessCard({ row, now, onOpen, compact }: { row: PortalRow; now: number; onOpen: (id: string) => void; compact?: boolean }) {
  const review = REVIEW_PILL[reviewStatusOf(row.nextReviewDate, now)];
  const cat = pcfTopCategory(row.pcfHierarchyId);
  return (
    <Link
      href={`/processes/${row.id}`}
      onClick={() => onOpen(row.id)}
      className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-blue-400 hover:shadow transition"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium text-gray-800 text-sm leading-snug line-clamp-2">{row.name}</span>
        <DiagramTypeBadge type={row.type} />
      </div>
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
          {row.ownerName && <span>👤 {row.ownerName}</span>}
          {row.versionNumber != null && <span className="text-blue-700 border border-blue-200 bg-blue-50 rounded px-1">v{row.versionNumber}</span>}
          {row.pcfName && <span className="text-purple-700 border border-purple-200 bg-purple-50 rounded px-1 truncate max-w-[140px]" title={`${row.pcfHierarchyId ?? ""} ${row.pcfName}`}>{cat} {row.pcfName}</span>}
          {row.procedureDocUrl && <span title={row.procedureDocName ?? "Procedure document"}>📄</span>}
          {row.via === "bundle" && <span className="text-gray-400">shared</span>}
        </div>
      )}
      {review && <span className={`inline-block mt-2 text-[10px] border rounded px-1.5 py-0.5 ${review.cls}`}>{review.label}</span>}
    </Link>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="text-center py-16 text-gray-500">
      <p className="text-base font-medium text-gray-700">{title}</p>
      <p className="text-sm mt-1 max-w-md mx-auto">{body}</p>
    </div>
  );
}
