import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DiagramEditor } from "./DiagramEditor";
import type { DiagramData, DiagramType } from "@/app/lib/diagram/types";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";

type Props = { params: Promise<{ id: string }> };

export default async function DiagramPage({ params }: Props) {
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

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  const diagram = await prisma.diagram.findFirst({
    where: { id, userId: effectiveUserId, orgId },
  });

  // Redirect rather than notFound() so the not-found chunk-loading
  // path (a Next.js 16 known issue producing ChunkLoadError +
  // _not-found InvariantError) is sidestepped.
  if (!diagram) redirect("/dashboard");

  const data: DiagramData =
    diagram.data && typeof diagram.data === "object" && !Array.isArray(diagram.data)
      ? (diagram.data as unknown as DiagramData)
      : EMPTY_DIAGRAM;

  const diagramColorConfig: SymbolColorConfig =
    diagram.colorConfig && typeof diagram.colorConfig === "object" && !Array.isArray(diagram.colorConfig)
      ? (diagram.colorConfig as unknown as SymbolColorConfig)
      : {};

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

  // Commit count baked into the build via NEXT_PUBLIC_COMMIT_COUNT
  // (set from --build-arg GIT_COMMIT_COUNT in the Dockerfile).
  const commitCount = parseInt(process.env.NEXT_PUBLIC_COMMIT_COUNT ?? "0", 10) || 0;

  return (
    <DiagramEditor
        diagramId={diagram.id}
        diagramName={diagram.name}
        diagramType={diagram.type as DiagramType}
        initialData={data}
        projectId={diagram.projectId ?? null}
        initialDiagramColorConfig={diagramColorConfig}
        initialDisplayMode={(diagram.displayMode as DisplayMode) ?? "normal"}
        userEmail={session.user.email ?? ""}
        createdAt={diagram.createdAt.toISOString()}
        updatedAt={diagram.updatedAt.toISOString()}
        readOnly={viewing}
        viewingAsName={viewingAsName}
        viewingAsEmail={viewingAsEmail}
        version={commitCount}
      />
  );
}
