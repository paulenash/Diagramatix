"use client";

import type { ReactNode } from "react";

export type HelpChapter = {
  slug: string;
  title: string;
  sections: HelpSection[];
};

export type HelpSection = {
  heading?: string;
  body: ReactNode;
  /** Path relative to /public, e.g. "/help/dashboard-overview.png" */
  image?: string;
  imageAlt?: string;
  /** Optional caption shown below image */
  imageCaption?: string;
};

/* ---------- screenshot helper ---------- */
function Screenshot({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption?: string;
}) {
  return (
    <figure className="my-4 border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="w-full h-auto"
      />
      {caption && (
        <figcaption className="text-xs text-gray-500 px-3 py-2 border-t border-gray-100">
          {caption}
        </figcaption>
      )}
    </figure>
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
          {sec.image && (
            <Screenshot
              src={sec.image}
              alt={sec.imageAlt ?? sec.heading ?? "screenshot"}
              caption={sec.imageCaption}
            />
          )}
        </section>
      ))}
    </article>
  );
}
