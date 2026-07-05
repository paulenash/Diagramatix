/**
 * Read-only viewer for the SuperAdmin **Technical Design Notes** (the tech-design
 * document collection). Mirrors /help but SuperAdmin-gated for the WHOLE route —
 * the entire collection is internal, so there is no audience filtering. Reuses
 * HelpViewer + renderHelpMarkdown.
 */
import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HelpViewer, type RenderedChapter } from "../help/HelpViewer";
import { isSuperuser } from "@/app/lib/superuser";
import { prisma } from "@/app/lib/db";
import { renderHelpMarkdown } from "@/app/lib/help/renderMarkdown";

export const metadata = { title: "Diagramatix — Technical Design Notes" };

export default async function TechNotesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");

  const { c } = await searchParams;
  const navChapters = await prisma.helpChapter.findMany({
    where: { collection: "tech-design" },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, title: true },
  });

  if (navChapters.length === 0) {
    return (
      <div className="min-h-screen dgx-dashboard-bg flex items-center justify-center">
        <p className="text-sm text-gray-500">
          No Technical Design Notes yet. Add them at{" "}
          <Link href="/dashboard/admin/user-guide?collection=tech-design" className="underline text-blue-600">SuperAdmin → Document Editor</Link>.
        </p>
      </div>
    );
  }

  const currentSlug = navChapters.find((ch) => ch.slug === c)?.slug ?? navChapters[0].slug;
  const dbChapter = await prisma.helpChapter.findFirst({
    where: { slug: currentSlug, collection: "tech-design" },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  const current: RenderedChapter = {
    slug: dbChapter!.slug,
    title: dbChapter!.title,
    adminOnly: false,
    sections: dbChapter!.sections.map((s) => ({
      heading: s.heading,
      bodyHtml: renderHelpMarkdown(s.bodyMarkdown),
      adminOnly: false,
      image: s.image,
      imageAlt: s.imageAlt,
      imageCaption: s.imageCaption,
    })),
  };

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <span style={{ fontSize: "1.75em", lineHeight: 1 }}>{"←"}</span>
            <span className="underline">Dashboard</span>
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">Technical Design Notes</h1>
          <span className="text-[9px] font-semibold text-red-600 border border-red-300 bg-red-50 rounded px-1">SUPERADMIN</span>
        </div>
        <Link href={`/dashboard/admin/user-guide?collection=tech-design`} className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50">Edit →</Link>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-[220px_1fr] gap-6">
        <nav className="text-sm">
          <ol className="space-y-1">
            {navChapters.map((ch, i) => {
              const active = ch.slug === current.slug;
              return (
                <li key={ch.slug}>
                  <Link
                    href={`/tech-notes?c=${ch.slug}`}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${active ? "bg-blue-50 text-blue-700 font-medium" : "text-gray-700 hover:bg-gray-100"}`}
                  >
                    <span>{i + 1}. {ch.title}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="bg-white border border-gray-200 rounded-lg p-6">
          <HelpViewer chapter={current} isAdmin={false} />
        </main>
      </div>
    </div>
  );
}
