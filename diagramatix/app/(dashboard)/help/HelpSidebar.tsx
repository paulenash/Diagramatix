"use client";

/**
 * Searchable / filterable navigation for the User Guide. Holds a lightweight
 * index of every (visible) chapter — title + plaintext body — and filters it
 * client-side as the user types or picks a category. Chapter links carry the
 * current query + category so the state survives navigating between chapters
 * (the main pane is still server-rendered per chapter).
 */
import Link from "next/link";
import { useMemo, useState } from "react";

export interface GuideIndexEntry {
  slug: string;
  title: string;
  category: string | null;
  adminOnly: boolean;
  text: string; // concatenated plaintext of the chapter's sections, for search
}

const UNGROUPED = "General";

// Strip the markdown that would clutter a snippet (headings, emphasis, links,
// pipes, code fences) down to readable text.
function toPlain(md: string): string {
  return md
    .replace(/`{1,3}[^`]*`{1,3}/g, " ")
    .replace(/[#>*_~|]+/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function snippet(text: string, q: string): { before: string; hit: string; after: string } | null {
  const plain = toPlain(text);
  const i = plain.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return null;
  const start = Math.max(0, i - 45);
  const end = Math.min(plain.length, i + q.length + 70);
  return {
    before: (start > 0 ? "… " : "") + plain.slice(start, i),
    hit: plain.slice(i, i + q.length),
    after: plain.slice(i + q.length, end) + (end < plain.length ? " …" : ""),
  };
}

export function HelpSidebar({
  entries, currentSlug, viewQs, initialQuery, initialCategory,
}: {
  entries: GuideIndexEntry[];
  currentSlug: string;
  viewQs: string;
  initialQuery: string;
  initialCategory: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory || "");

  const categories = useMemo(() => {
    const set = new Set<string>();
    entries.forEach(e => set.add(e.category || UNGROUPED));
    return Array.from(set);
  }, [entries]);

  const q = query.trim();
  const href = (slug: string) => {
    const p = new URLSearchParams();
    p.set("c", slug);
    if (q) p.set("q", q);
    if (category) p.set("cat", category);
    return `/help?${p.toString()}${viewQs}`;
  };

  // Filter by category then by query (title OR body). Rank title matches first.
  const filtered = useMemo(() => {
    const ql = q.toLowerCase();
    return entries
      .filter(e => !category || (e.category || UNGROUPED) === category)
      .filter(e => !ql || e.title.toLowerCase().includes(ql) || e.text.toLowerCase().includes(ql))
      .sort((a, b) => {
        if (!ql) return 0;
        const at = a.title.toLowerCase().includes(ql) ? 0 : 1;
        const bt = b.title.toLowerCase().includes(ql) ? 0 : 1;
        return at - bt;
      });
  }, [entries, category, q]);

  // Group the (filtered) list by category for display when NOT searching.
  const grouped = useMemo(() => {
    const m = new Map<string, GuideIndexEntry[]>();
    for (const e of filtered) {
      const k = e.category || UNGROUPED;
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <nav className="text-sm" data-no-capture>
      <div className="space-y-2 mb-3">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide…"
            className="w-full text-sm border border-gray-300 rounded pl-7 pr-7 py-1.5 text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          {query && (
            <button onClick={() => setQuery("")} title="Clear" className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-base leading-none px-1">×</button>
          )}
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400"
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <p className="text-xs text-gray-400 px-2 py-3">No pages match “{q}”.</p>
      ) : q ? (
        // Search results: flat list with a snippet.
        <ol className="space-y-1">
          {filtered.map(e => {
            const active = e.slug === currentSlug;
            const snip = snippet(e.text, q);
            return (
              <li key={e.slug}>
                <Link
                  href={href(e.slug)}
                  className={`block px-2 py-1.5 rounded ${active ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-gray-100"}`}
                >
                  <span className={`flex items-center justify-between gap-2 ${active ? "text-blue-700 font-medium" : "text-gray-800"}`}>
                    <span>{e.title}</span>
                    {e.adminOnly && <span className="text-[9px] font-semibold text-red-600 border border-red-300 bg-red-50 rounded px-1 shrink-0">SUPER</span>}
                  </span>
                  <span className="block text-[11px] text-gray-400">{e.category || UNGROUPED}</span>
                  {snip && (
                    <span className="block text-[11px] text-gray-500 mt-0.5 leading-snug">
                      {snip.before}<mark className="bg-yellow-200 text-gray-900 rounded-sm px-0.5">{snip.hit}</mark>{snip.after}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        // Browse: grouped by category.
        <div className="space-y-3">
          {grouped.map(([cat, list]) => (
            <div key={cat}>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 px-2 mb-1">{cat}</p>
              <ol className="space-y-0.5">
                {list.map(e => {
                  const active = e.slug === currentSlug;
                  return (
                    <li key={e.slug}>
                      <Link
                        href={href(e.slug)}
                        className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${
                          active ? "bg-blue-50 text-blue-700 font-medium"
                            : e.adminOnly ? "text-red-700 hover:bg-red-50" : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <span>{e.title}</span>
                        {e.adminOnly && <span className="text-[9px] font-semibold text-red-600 border border-red-300 bg-red-50 rounded px-1 shrink-0">SUPER</span>}
                      </Link>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
