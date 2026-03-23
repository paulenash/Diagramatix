import { redirect } from "next/navigation";
import { execSync } from "child_process";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [projects, unorganized] = await Promise.all([
    prisma.project.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      include: { _count: { select: { diagrams: true } } },
    }),
    prisma.diagram.findMany({
      where: { userId: session.user.id, projectId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
    }),
  ]);

  let commitCount = 0;
  try {
    commitCount = parseInt(execSync("git rev-list --count HEAD", { encoding: "utf8" }).trim(), 10) || 0;
  } catch { /* fallback to 0 */ }

  return (
    <DashboardClient
      projects={projects}
      unorganized={unorganized}
      userName={session.user.name ?? session.user.email ?? "User"}
      version={commitCount}
    />
  );
}
