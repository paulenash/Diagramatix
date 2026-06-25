"use client";

import type { ReactNode } from "react";

export type HelpSection = {
  heading?: string;
  body: ReactNode;
  /** When true the section is hidden from non-SuperAdmin viewers.
   *  Use for SuperAdmin-only tools embedded inside an otherwise
   *  general chapter (Paul's rule, 2026-06-09): SuperAdmin functions
   *  must not be visible to anyone else; OrgAdmin features stay
   *  visible to all so users know what their OrgAdmin can do. */
  adminOnly?: boolean;
  /** Path relative to /public, e.g. "/help/dashboard-overview.png" */
  image?: string;
  imageAlt?: string;
  /** Optional caption shown below image */
  imageCaption?: string;
};

export type HelpChapter = {
  slug: string;
  title: string;
  sections: HelpSection[];
  adminOnly?: boolean;
};

/* ---------- diagram placeholder ---------- */
function DiagramPlaceholder({ caption }: { caption: string }) {
  return (
    <div className="my-4">
      <p className="text-sm text-orange-500 font-medium italic">
        &laquo;Diagram: {caption}&raquo;
      </p>
    </div>
  );
}

/* ---------- main viewer ---------- */
export function HelpViewer({ chapter, isAdmin = false }: { chapter: HelpChapter; isAdmin?: boolean }) {
  // Filter out SuperAdmin-only sections for non-admins. Chapter-level
  // adminOnly is already enforced upstream by page.tsx; this guards
  // the section-level case.
  const sections = chapter.sections.filter(sec => isAdmin || !sec.adminOnly);
  const chapterAdmin = isAdmin && chapter.adminOnly;
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <h2 className="text-xl font-bold text-gray-900 m-0">{chapter.title}</h2>
        {chapterAdmin && (
          <span className="text-[10px] font-semibold text-red-700 border border-red-300 bg-red-50 rounded px-1.5 py-0.5">
            SuperAdmin only
          </span>
        )}
      </div>

      {chapterAdmin && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
          This entire chapter is <strong>SuperAdmin-only</strong> — hidden from User and OrgAdmin viewers.
        </p>
      )}

      {sections.map((sec, i) => {
        // In the SuperAdmin (full) view, visually flag SuperAdmin-only sections
        // embedded in an otherwise general chapter. (Non-admins never reach this
        // branch — those sections are filtered out above.)
        const adminSec = isAdmin && sec.adminOnly;
        return (
          <section
            key={i}
            className={`mb-6 ${adminSec ? "border-l-4 border-red-300 bg-red-50/40 rounded-r -ml-3 pl-3 py-2" : ""}`}
          >
            {adminSec && (
              <span className="inline-block text-[9px] font-semibold text-red-600 border border-red-300 bg-red-50 rounded px-1 mb-1">
                SuperAdmin only
              </span>
            )}
            {sec.heading && (
              <h3 className="text-base font-semibold text-gray-800 mb-2">
                {sec.heading}
              </h3>
            )}
            <div className="text-gray-700 leading-relaxed">{sec.body}</div>
            {sec.imageCaption && (
              <DiagramPlaceholder caption={sec.imageCaption} />
            )}
          </section>
        );
      })}
    </article>
  );
}
