import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { ProjectDetailClient } from "./ProjectDetailClient";
import { getEffectiveUserId, isImpersonating, getImpersonationMode, isSuperuser } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  let effectiveUserId = getEffectiveUserId(session, cookieStore);
  let viewing = isImpersonating(session, cookieStore);

  // Validate impersonation target exists
  if (viewing) {
    const target = await prisma.user.findUnique({ where: { id: effectiveUserId }, select: { id: true } });
    if (!target) { cookieStore.delete("dgx_view_as"); effectiveUserId = session.user.id; viewing = false; }
  }

  const { id } = await params;

  // Project detail means the real user has navigated off any open diagram.
  if (!viewing && session.user.id) {
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { currentDiagramId: null, currentDiagramName: null },
      });
    } catch { /* best-effort */ }
  }

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  // Commit count baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile).
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;

  const [project, otherProjects] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId: effectiveUserId, orgId },
      include: {
        diagrams: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, type: true, createdAt: true, updatedAt: true, data: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { userId: effectiveUserId, orgId, id: { not: id } },
      select: { id: true, name: true },
    }),
  ]);

  // Project might not match because: (a) doesn't exist, (b) belongs to
  // another user, (c) project's orgId differs from the user's current
  // org context (common after a Full Restore where row IDs preserve but
  // org membership changes). Redirect rather than notFound() to dodge
  // a Next.js 16 _not-found chunk-loading bug that produces a 404 on
  // the resource itself.
  if (!project) redirect("/dashboard");

  // If impersonating, fetch the target user's info for the banner
  let viewingAsName = "";
  let viewingAsEmail = "";
  if (viewing) {
    const target = await prisma.user.findUnique({
      where: { id: effectiveUserId },
      select: { name: true, email: true },
    });
    viewingAsName = target?.name ?? "";
    viewingAsEmail = target?.email ?? "";
  }

  const impersonationMode = viewing ? getImpersonationMode(cookieStore) : undefined;

  return (
    <ProjectDetailClient
      project={project}
      otherProjects={otherProjects}
      version={commitCount}
      readOnly={viewing && impersonationMode === "view"}
      viewingAsName={viewingAsName}
      viewingAsEmail={viewingAsEmail}
      impersonationMode={impersonationMode}
      isAdmin={isSuperuser(session)}
    />
  );
}
