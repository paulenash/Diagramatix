import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getCurrentOrgId, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";
import { safeInternalPath } from "@/app/lib/safeRedirect";
import { AiModelsClient } from "./AiModelsClient";

export const metadata = { title: "Diagramatix — AI Models" };

/** OrgAdmin: the AI models this organisation's people run on, chosen from the lists SuperAdmin offered it. */
export default async function OrgAiModelsPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const cookieStore = await cookies();
  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, cookieStore);
    await requireOrgAdminFor(session, cookieStore, orgId);
  } catch (err) {
    if (err instanceof OrgContextError) redirect("/dashboard");
    throw err;
  }
  const org = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
  const backHref = safeInternalPath((await searchParams).from) ?? "/dashboard/org-admin";

  return (
    <div className="min-h-screen dgx-dashboard-bg">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3">
        <Link href={backHref} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
          <span style={{ fontSize: "1.5em", lineHeight: 1 }}>{"←"}</span><span className="underline">OrgAdmin</span>
        </Link>
        <h1 className="text-lg font-semibold text-gray-900">AI Models <span className="text-sm font-normal text-gray-400">— {org?.name ?? "Organisation"}</span></h1>
      </header>
      <AiModelsClient />
    </div>
  );
}
