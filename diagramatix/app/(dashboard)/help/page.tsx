import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HelpViewer, type RenderedChapter } from "./HelpViewer";
import { HelpSidebar, type GuideIndexEntry } from "./HelpSidebar";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";

export const metadata = { title: "Diagramatix — User Guide" };

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; view?: string; q?: string; cat?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const realIsAdmin = isSuperuser(session);
  const { c, view, q, cat } = await searchParams;
  // SuperAdmin can preview the standard (User / OrgAdmin) view. `isAdmin` is the
  // EFFECTIVE flag used for filtering.
  const previewStandard = realIsAdmin && view === "standard";
  const isAdmin = realIsAdmin && !previewStandard;
  const viewQs = previewStandard ? "&view=standard" : "";

  // One query feeds BOTH the searchable sidebar index and the current chapter's
  // rendered body. The guide lives in the DB (migrated out of chapters.tsx) so
  // SuperAdmins can edit it in-app.
  const allChapters = await prisma.helpChapter.findMany({
    where: { collection: "user-guide" },
    orderBy: { sortOrder: "asc" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  const visibleChapters = isAdmin ? allChapters : allChapters.filter(ch => !ch.adminOnly);

  if (visibleChapters.length === 0) {
    return (
      <div className="min-h-screen dgx-dashboard-bg flex items-center justify-center">
        <p className="text-sm text-gray-500">
          The User Guide has no content yet.
          {realIsAdmin && " Add chapters at SuperAdmin → User Guide."}
        </p>
      </div>
    );
  }

  const currentSlug = visibleChapters.find(ch => ch.slug === c)?.slug ?? visibleChapters[0].slug;
  const dbChapter = visibleChapters.find(ch => ch.slug === currentSlug)!;

  // Render only the CURRENT chapter's sections (markdown → sanitised HTML).
  const current: RenderedChapter = {
    slug: dbChapter.slug,
    title: dbChapter.title,
    adminOnly: dbChapter.adminOnly,
    sections: dbChapter.sections.map(s => ({
      heading: s.heading,
      bodyHtml: renderHelpMarkdown(s.bodyMarkdown),
      adminOnly: s.adminOnly,
      image: s.image,
      imageAlt: s.imageAlt,
      imageCaption: s.imageCaption,
    })),
  };

  // Lightweight full-guide search index (title + plaintext of visible sections).
  const entries: GuideIndexEntry[] = visibleChapters.map(ch => ({
    slug: ch.slug,
    title: ch.title,
    category: ch.category,
    adminOnly: ch.adminOnly,
    text: ch.sections
      .filter(s => isAdmin || !s.adminOnly)
      .map(s => `${s.heading ?? ""} ${s.bodyMarkdown}`)
      .join(" "),
  }));

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">Dashboard</span>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">User Guide</h1>
        </div>
        {realIsAdmin ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">Viewing as:</span>
            <Link
              href={`/help?c=${current.slug}`}
              className={`px-2 py-0.5 rounded ${!previewStandard
                ? "bg-red-50 text-red-700 font-semibold border border-red-200"
                : "text-gray-500 hover:bg-gray-100"}`}
            >
              SuperAdmin
            </Link>
            <Link
              href={`/help?c=${current.slug}&view=standard`}
              className={`px-2 py-0.5 rounded ${previewStandard
                ? "bg-blue-50 text-blue-700 font-semibold border border-blue-200"
                : "text-gray-500 hover:bg-gray-100"}`}
            >
              User / OrgAdmin
            </Link>
          </div>
        ) : (
          <span className="text-xs text-gray-500">Diagramatix</span>
        )}
      </header>

      {previewStandard && (
        <div className="bg-blue-50 border-b border-blue-200 px-6 py-1.5 text-center text-xs text-blue-700">
          Previewing the <strong>standard (User / OrgAdmin)</strong> guide — SuperAdmin-only pages are hidden.
          {" "}<Link href={`/help?c=${current.slug}`} className="underline">Back to SuperAdmin view</Link>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-[240px_1fr] gap-6">
        <HelpSidebar
          entries={entries}
          currentSlug={current.slug}
          viewQs={viewQs}
          initialQuery={q ?? ""}
          initialCategory={cat ?? ""}
        />

        <main className="bg-white border border-gray-200 rounded-lg p-6">
          <HelpViewer chapter={current} isAdmin={isAdmin} />
        </main>
      </div>
    </div>
  );
}
