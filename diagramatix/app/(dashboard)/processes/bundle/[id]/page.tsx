import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DiagramTypeBadge } from "@/app/components/DiagramTypeBadge";

// /processes/bundle/[id] — landing page for a Publication Bundle.
// Shows the roots as tiles; clicking one opens the per-diagram viewer
// with the bundle id propagated via ?bundle= so the view stack and
// "Back" affordance know which bundle the user came from.
//
// Access: the caller must be either the bundle's publisher (preview) or
// an active audience member. Anyone else → 404 (don't leak existence).
type Props = { params: Promise<{ id: string }> };

export default async function BundleIndexPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const { id } = await params;

  const bundle = await prisma.publicationBundle.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      releaseNotes: true,
      publishedAt: true,
      supersededAt: true,
      nextReviewDate: true,
      publishedById: true,
      publishedBy: { select: { id: true, name: true, email: true } },
      diagrams: {
        where: { isRoot: true },
        include: {
          diagram: {
            select: {
              id: true,
              name: true,
              type: true,
              lifecycle: true,
              currentPublishedVersion: { select: { versionNumber: true, publishedAt: true } },
            },
          },
        },
        orderBy: { addedAt: "asc" },
      },
      audience: {
        where: { userId },
        select: { userId: true },
      },
    },
  });
  if (!bundle) redirect("/dashboard");

  const isOwner = bundle.publishedById === userId;
  const isAudience = bundle.audience.length > 0;
  if (!isOwner && !isAudience) redirect("/dashboard");

  // Show archived bundles to the owner (read-only) but redirect audience
  // members away — their grants are revoked.
  if (bundle.supersededAt && !isOwner) redirect("/dashboard");

  // publishedBy is null when the publishing account was deleted (author FK
  // is SetNull — audit DATA-01).
  const publisherDisplay = bundle.publishedBy?.name ?? bundle.publishedBy?.email ?? "a former member";

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="text-sm text-blue-600 hover:text-blue-800">
          ← Dashboard
        </Link>
        <div className="h-4 border-l border-gray-300" />
        <h1 className="text-base font-semibold text-gray-900 flex-1 truncate">{bundle.name}</h1>
        {bundle.supersededAt && (
          <span className="text-[11px] text-gray-600 border border-gray-300 bg-gray-50 rounded px-2 py-0.5">
            Archived
          </span>
        )}
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="text-xs text-gray-700">
            Published <strong>{new Date(bundle.publishedAt).toLocaleDateString()}</strong> by{" "}
            <strong>{publisherDisplay}</strong>
            {bundle.nextReviewDate && (
              <>
                {" · "}Next review <strong>{new Date(bundle.nextReviewDate).toLocaleDateString()}</strong>
              </>
            )}
          </div>
          {bundle.releaseNotes && (
            <div className="mt-3 text-sm text-gray-800 whitespace-pre-wrap">{bundle.releaseNotes}</div>
          )}
        </div>

        <h2 className="text-sm font-semibold text-gray-900 mb-3">
          Processes in this release ({bundle.diagrams.length})
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {bundle.diagrams.map(d => (
            <Link
              key={d.diagramId}
              href={`/processes/${d.diagramId}?bundle=${bundle.id}`}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow transition"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-medium text-gray-900 truncate flex-1">{d.diagram.name}</div>
                <DiagramTypeBadge type={d.diagram.type} className="shrink-0" />
              </div>
              {d.diagram.currentPublishedVersion && (
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[11px] px-1.5 py-0.5 rounded border text-blue-700 border-blue-300 bg-blue-50 font-medium">
                    v{d.diagram.currentPublishedVersion.versionNumber}
                  </span>
                  <span className="text-[10px] text-gray-700">
                    {new Date(d.diagram.currentPublishedVersion.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              )}
            </Link>
          ))}
        </div>
        {bundle.diagrams.length === 0 && (
          <div className="text-sm text-gray-700 text-center py-8 border border-dashed border-gray-300 rounded-lg">
            This bundle has no root diagrams yet.
          </div>
        )}
      </main>
    </div>
  );
}
