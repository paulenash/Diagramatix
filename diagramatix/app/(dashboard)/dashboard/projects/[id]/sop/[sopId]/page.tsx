import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { SopEditorClient } from "./SopEditorClient";

export const metadata = { title: "Diagramatix — SOP" };

export default async function SopPage({ params }: { params: Promise<{ id: string; sopId: string }> }) {
  const { id: projectId, sopId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const doc = await prisma.sopDocument.findUnique({
    where: { id: sopId },
    include: { sections: { orderBy: { sortOrder: "asc" } } },
  });
  if (!doc || doc.projectId !== projectId) redirect(`/dashboard/projects/${projectId}`);

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
      initialTitle={doc.title}
      initialStatus={doc.status}
      initialScopeLabel={doc.scopeLabel}
      initialSections={doc.sections.map((s) => ({ heading: s.heading ?? "", bodyMarkdown: s.bodyMarkdown }))}
    />
  );
}
