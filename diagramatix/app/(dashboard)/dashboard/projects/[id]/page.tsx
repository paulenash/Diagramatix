import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { ProjectDetailClient } from "./ProjectDetailClient";

type Props = { params: Promise<{ id: string }> };

export default async function ProjectPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const [project, otherProjects] = await Promise.all([
    prisma.project.findFirst({
      where: { id, userId: session.user.id },
      include: {
        diagrams: {
          orderBy: { updatedAt: "desc" },
          select: { id: true, name: true, type: true, createdAt: true, updatedAt: true },
        },
      },
    }),
    prisma.project.findMany({
      where: { userId: session.user.id, id: { not: id } },
      select: { id: true, name: true },
    }),
  ]);

  if (!project) notFound();

  return <ProjectDetailClient project={project} otherProjects={otherProjects} />;
}
