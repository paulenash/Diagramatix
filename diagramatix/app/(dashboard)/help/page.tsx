import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HelpViewer, type HelpChapter } from "./HelpViewer";
import { CHAPTERS } from "./chapters";
import { isSuperuser } from "@/app/lib/superuser";

export const metadata = { title: "Diagramatix — User Guide" };

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; view?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const realIsAdmin = isSuperuser(session);
  const { c, view } = await searchParams;
  // SuperAdmin can preview the standard (User / OrgAdmin) view to check what
  // non-admins see. The standard view is identical for User and OrgAdmin
  // (2-way model). `isAdmin` is the EFFECTIVE flag used for filtering.
  const previewStandard = realIsAdmin && view === "standard";
  const isAdmin = realIsAdmin && !previewStandard;
  const viewQs = previewStandard ? "&view=standard" : "";

  const visibleChapters = isAdmin
    ? CHAPTERS
    : CHAPTERS.filter(ch => !ch.adminOnly);

  const current: HelpChapter =
    visibleChapters.find(ch => ch.slug === c) ?? visibleChapters[0];

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

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-[220px_1fr] gap-6">
        <nav className="text-sm">
          <ol className="space-y-1">
            {visibleChapters.map((ch, i) => {
              const active = ch.slug === current.slug;
              // In the SuperAdmin (full) view, flag chapters that are hidden
              // from regular users so it's clear what's admin-only.
              const adminOnly = isAdmin && ch.adminOnly;
              return (
                <li key={ch.slug}>
                  <Link
                    href={`/help?c=${ch.slug}${viewQs}`}
                    className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : adminOnly
                          ? "text-red-700 hover:bg-red-50"
                          : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    <span>{i + 1}. {ch.title}</span>
                    {adminOnly && (
                      <span className="text-[9px] font-semibold text-red-600 border border-red-300 bg-red-50 rounded px-1 shrink-0">
                        SUPER
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="bg-white border border-gray-200 rounded-lg p-6">
          <HelpViewer chapter={current} isAdmin={isAdmin} />
        </main>
      </div>
    </div>
  );
}
