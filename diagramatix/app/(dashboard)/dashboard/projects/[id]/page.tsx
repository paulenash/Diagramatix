import { notFound, redirect } from "next/navigation";
import { execSync } from "child_process";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { ProjectDetailClient } from "./ProjectDetailClient";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";

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

  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch {}

  const [project, otherProjects] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId: effectiveUserId },
      include: {
        diagrams: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, type: true, createdAt: true, updatedAt: true, data: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { userId: effectiveUserId, id: { not: id } },
      select: { id: true, name: true },
    }),
  ]);

  if (!project) notFound();

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

  return (
    <ProjectDetailClient
      project={project}
      otherProjects={otherProjects}
      version={commitCount}
      readOnly={viewing}
      viewingAsName={viewingAsName}
      viewingAsEmail={viewingAsEmail}
    />
  );
}
