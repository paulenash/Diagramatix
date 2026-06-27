"use client";

import type { ReactNode } from "react";

/* ── Legacy content types — still used by the seed file `chapters.tsx`
 *    (kept in-repo as the migration source until the DB guide is trusted). ── */
export type HelpSection = {
  heading?: string;
  body: ReactNode;
  adminOnly?: boolean;
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
};
export type HelpChapter = {
  slug: string;
  title: string;
  sections: HelpSection[];
  adminOnly?: boolean;
};

/* ── DB-rendered shape: Markdown already rendered to sanitised HTML server-side. ── */
export type RenderedSection = {
  heading?: string | null;
  bodyHtml: string;
  adminOnly?: boolean;
  image?: string | null;
  imageAlt?: string | null;
  imageCaption?: string | null;
};
export type RenderedChapter = {
  slug: string;
  title: string;
  adminOnly?: boolean;
  sections: RenderedSection[];
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
export function HelpViewer({ chapter, isAdmin = false }: { chapter: RenderedChapter; isAdmin?: boolean }) {
  // Filter out SuperAdmin-only sections for non-admins. Chapter-level adminOnly
  // is already enforced upstream by page.tsx; this guards the section-level case.
  const sections = chapter.sections.filter(sec => isAdmin || !sec.adminOnly);
  const chapterAdmin = isAdmin && chapter.adminOnly;
  return (
    <article className="prose prose-sm prose-gray max-w-none
      [&_table]:w-full [&_table]:my-2 [&_table]:border-collapse
      [&_th]:border [&_th]:border-gray-300 [&_th]:bg-gray-50 [&_th]:p-1.5 [&_th]:text-left
      [&_td]:border [&_td]:border-gray-300 [&_td]:p-1.5">
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
        // In the SuperAdmin (full) view, visually flag SuperAdmin-only sections.
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
            {/* Body is sanitised HTML rendered from the section's Markdown. */}
            <div
              className="text-gray-700 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sec.bodyHtml }}
            />
            {sec.image ? (
              <figure className="my-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sec.image} alt={sec.imageAlt ?? ""} className="rounded border border-gray-200 max-w-full" />
                {sec.imageCaption && (
                  <figcaption className="text-xs text-gray-500 mt-1">{sec.imageCaption}</figcaption>
                )}
              </figure>
            ) : (
              sec.imageCaption && <DiagramPlaceholder caption={sec.imageCaption} />
            )}
          </section>
        );
      })}
    </article>
  );
}
