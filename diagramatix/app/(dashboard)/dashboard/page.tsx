import { redirect } from "next/navigation";
import { execSync } from "child_process";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";
import { getEffectiveUserId, isImpersonating, isSuperuser } from "@/app/lib/superuser";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const cookieStore = await cookies();
  const effectiveUserId = getEffectiveUserId(session, cookieStore);
  const viewing = isImpersonating(session, cookieStore);

  const [projects, unorganized] = await Promise.all([
    prisma.project.findMany({
      where: { userId: effectiveUserId },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { diagrams: true } } },
    }),
    prisma.diagram.findMany({
      where: { userId: effectiveUserId, projectId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
    }),
  ]);

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

  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch { /* fallback to 0 */ }

  return (
    <DashboardClient
      projects={projects}
      unorganized={unorganized}
      userName={session.user.name ?? "User"}
      userEmail={session.user.email ?? ""}
      version={commitCount}
      readOnly={viewing}
      viewingAsName={viewingAsName}
      viewingAsEmail={viewingAsEmail}
      isSuperuser={isSuperuser(session)}
    />
  );
}
