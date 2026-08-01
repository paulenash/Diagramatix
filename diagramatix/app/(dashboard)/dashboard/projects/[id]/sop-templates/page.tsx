import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, OrgContextError } from "@/app/lib/auth/orgContext";
import { SopTemplatesManager } from "@/app/components/sop/SopTemplatesManager";

export const metadata = { title: "Diagramatix — SOP Templates" };

export default async function ProjectSopTemplatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) redirect("/dashboard");
  try {
    await requireProjectAccess(session, await cookies(), projectId, "edit");
  } catch (err) {
    if (err instanceof OrgContextError) redirect(`/dashboard/projects/${projectId}`);
    throw err;
  }

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href={`/dashboard/projects/${projectId}`} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span><span className="underline">Project</span>
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">SOP Templates <span className="text-sm font-normal text-gray-400">— {project.name}</span></h1>
      </header>
      <p className="max-w-3xl mx-auto px-6 pt-4 text-xs text-gray-500">Project templates override this org&rsquo;s default for SOPs generated in this project.</p>
      <SopTemplatesManager scope="project" scopeId={projectId} />
    </div>
  );
}
