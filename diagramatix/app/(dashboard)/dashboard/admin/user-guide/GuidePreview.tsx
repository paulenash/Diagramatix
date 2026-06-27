"use client";

/**
 * In-editor "view mode" for the User Guide: renders the saved chapters exactly as
 * the live guide would, with full chapter + section navigation. Selecting a
 * chapter/section here updates the shared selCh/selSec, so "Back to Edit Mode"
 * returns to whatever section you ended on.
 */
import { useEffect, useRef } from "react";
import { marked } from "marked";
import { symbolGlyphSvg } from "@/app/lib/help/symbolGlyph";

type Section = { heading: string | null; bodyMarkdown: string; adminOnly: boolean; image: string | null; imageAlt: string | null; imageCaption: string | null };
type Chapter = { slug: string; title: string; adminOnly: boolean; sections: Section[] };

function renderBody(md: string): string {
  let html = marked.parse(md ?? "", { async: false }) as string;
  // Swap :sym[type]: tokens for the inline diagram glyphs the guide uses.
  html = html.replace(/:sym\[([a-z0-9-]+)\]:/gi, (_m, t) => `<span class="inline-flex items-center align-middle mx-0.5">${symbolGlyphSvg(String(t))}</span>`);
  return html;
}

export function GuidePreview({
  chapters, selCh, selSec, setSelCh, setSelSec,
}: {
  chapters: Chapter[];
  selCh: number; selSec: number;
  setSelCh: (i: number) => void;
  setSelSec: (i: number) => void;
}) {
  const ch = chapters[selCh];
  const secRefs = useRef<(HTMLElement | null)[]>([]);

  // When the chapter changes (incl. initial mount), scroll to the active section.
  useEffect(() => {
    secRefs.current[selSec]?.scrollIntoView({ block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selCh]);

  function goSection(j: number) {
    setSelSec(j);
    secRefs.current[j]?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  if (!ch) return <div className="p-6 text-sm text-gray-500">No chapter.</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-[260px_1fr] gap-5">
      {/* Navigation */}
      <nav className="bg-white border border-gray-200 rounded-lg p-2 h-fit sticky top-4 max-h-[82vh] overflow-auto">
        <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide px-1">Contents</span>
        <ol className="space-y-0.5 mt-1">
          {chapters.map((c, i) => (
            <li key={i}>
              <button onClick={() => { setSelCh(i); setSelSec(0); }}
                className={`w-full text-left truncate px-2 py-1 rounded text-sm ${i === selCh ? "bg-blue-50 text-blue-800 font-medium" : "text-gray-700 hover:bg-gray-50"}`}>
                {i + 1}. {c.title || c.slug}
              </button>
              {i === selCh && c.sections.length > 1 && (
                <ul className="ml-3 mb-1 border-l border-gray-200 pl-2 space-y-0.5">
                  {c.sections.map((s, j) => (
                    <li key={j}>
                      <button onClick={() => goSection(j)}
                        className={`w-full text-left truncate text-xs py-0.5 ${j === selSec ? "text-blue-700 font-medium" : "text-gray-500 hover:text-gray-800"}`}>
                        {s.heading || `Section ${j + 1}`}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </nav>

      {/* Rendered chapter */}
      <article className="bg-white border border-gray-200 rounded-lg p-6 prose prose-sm prose-gray max-w-none
        text-gray-800 [--tw-prose-body:#1f2937] [--tw-prose-headings:#111827] [--tw-prose-bold:#111827]
        [--tw-prose-bullets:#4b5563] [--tw-prose-links:#1d4ed8] [&_ul]:list-disc [&_ol]:list-decimal [&_:is(ul,ol)]:pl-6">
        <h1 className="!mb-6">{ch.title}</h1>
        {ch.sections.map((s, j) => (
          <section key={j} ref={(el) => { secRefs.current[j] = el; }}
            className={`scroll-mt-4 rounded-md ${j === selSec ? "ring-2 ring-blue-200 -mx-2 px-2" : ""}`}>
            {s.heading && <h3>{s.heading}</h3>}
            <div dangerouslySetInnerHTML={{ __html: renderBody(s.bodyMarkdown) }} />
            {s.image && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt={s.imageAlt ?? ""} className="rounded border border-gray-200" />
                {s.imageCaption && <figcaption className="text-xs text-gray-500">{s.imageCaption}</figcaption>}
              </figure>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}
