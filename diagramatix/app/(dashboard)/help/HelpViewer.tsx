"use client";

import type { ReactNode } from "react";

export type HelpSection = {
  heading?: string;
  body: ReactNode;
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
export function HelpViewer({ chapter }: { chapter: HelpChapter }) {
  return (
    <article className="prose prose-sm prose-gray max-w-none">
      <h2 className="text-xl font-bold text-gray-900 mb-4">{chapter.title}</h2>

      {chapter.sections.map((sec, i) => (
        <section key={i} className="mb-6">
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
      ))}
    </article>
  );
}
