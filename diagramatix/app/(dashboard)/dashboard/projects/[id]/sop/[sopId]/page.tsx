import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { SopEditorClient } from "./SopEditorClient";

export const metadata = { title: "Diagramatix — SOP" };

export default async function SopPage({ params, searchParams }: { params: Promise<{ id: string; sopId: string }>; searchParams: Promise<{ from?: string }> }) {
  const { id: projectId, sopId } = await params;
  const { from } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const doc = await prisma.sopDocument.findUnique({
    where: { id: sopId },
    include: { sections: { orderBy: { sortOrder: "asc" } }, diagram: { select: { updatedAt: true } } },
  });
  if (!doc || doc.projectId !== projectId) redirect(`/dashboard/projects/${projectId}`);

  // "SOP Regeneration required" — the source diagram changed after this SOP was
  // last generated (generatedAt is (re)stamped on generate/regenerate).
  const stale = !!(doc.generatedAt && doc.diagram && doc.diagram.updatedAt > doc.generatedAt);

  // Return to the point of origin — the source diagram by default (or wherever the
  // SOP was opened from, when a ?from= is supplied). Only allow same-site paths.
  const safeFrom = from && from.startsWith("/") && !from.startsWith("//") ? from : null;
  const backHref = safeFrom ?? `/diagram/${doc.diagramId}`;

  try {
    await requireProjectAccess(session, await cookies(), projectId, "view");
  } catch (err) {
    if (err instanceof OrgContextError) redirect(`/dashboard/projects/${projectId}`);
    throw err;
  }

  return (
    <SopEditorClient
      projectId={projectId}
      sopId={doc.id}
      backHref={backHref}
      stale={stale}
      initialTitle={doc.title}
      initialStatus={doc.status}
      initialScopeLabel={doc.scopeLabel}
      initialSections={doc.sections.map((s) => ({ heading: s.heading ?? "", bodyMarkdown: s.bodyMarkdown, image: s.image }))}
    />
  );
}
