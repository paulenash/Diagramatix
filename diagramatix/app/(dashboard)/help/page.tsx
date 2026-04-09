import Link from "next/link";
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { HelpViewer, type HelpChapter } from "./HelpViewer";
import { CHAPTERS } from "./chapters";

export const metadata = { title: "Diagramatix — User Guide" };

export default async function HelpPage({
  searchParams,
}: {
  searchParams: Promise<{ c?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { c } = await searchParams;
  const current: HelpChapter =
    CHAPTERS.find(ch => ch.slug === c) ?? CHAPTERS[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold text-gray-900">User Guide</h1>
        </div>
        <span className="text-xs text-gray-500">Diagramatix</span>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-[220px_1fr] gap-6">
        <nav className="text-sm">
          <ol className="space-y-1">
            {CHAPTERS.map((ch, i) => {
              const active = ch.slug === current.slug;
              return (
                <li key={ch.slug}>
                  <Link
                    href={`/help?c=${ch.slug}`}
                    className={`block px-2 py-1 rounded ${
                      active
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {i + 1}. {ch.title}
                  </Link>
                </li>
              );
            })}
          </ol>
        </nav>

        <main className="bg-white border border-gray-200 rounded-lg p-6">
          <HelpViewer chapter={current} />
        </main>
      </div>
    </div>
  );
}
