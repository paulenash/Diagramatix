import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DiagramEditor } from "./DiagramEditor";
import type { DiagramData, DiagramType } from "@/app/lib/diagram/types";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";
import { getEffectiveUserId, isImpersonating, getImpersonationMode, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { isAssignedReviewer } from "@/app/lib/reviewProjects";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ review?: string }> };

export default async function DiagramPage({ params, searchParams }: Props) {
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
  const { review: reviewParam } = await searchParams;

  const orgId = await tryGetCurrentOrgId(session, cookieStore);
  if (!orgId) redirect("/dashboard");

  let diagram = await prisma.diagram.findFirst({
    where: { id, userId: effectiveUserId, orgId },
  });

  // Review Mode access (Phase 3): a diagram opened with ?review= that the
  // user doesn't own is allowed IF they're an assigned reviewer on it.
  // The diagram lives in the owner's org, so load it by id alone once the
  // reviewer relationship is confirmed.
  let reviewerAccess = false;
  if (!diagram && reviewParam && await isAssignedReviewer(session.user.id, id)) {
    diagram = await prisma.diagram.findUnique({ where: { id } });
    reviewerAccess = !!diagram;
  }

  // Redirect rather than notFound() so the not-found chunk-loading
  // path (a Next.js 16 known issue producing ChunkLoadError +
  // _not-found InvariantError) is sidestepped.
  if (!diagram) redirect("/dashboard");

  // Track the diagram the *real* user is working on (skip when an admin
  // is impersonating — we don't want the admin's clicks to overwrite the
  // target user's actual current diagram). Cleared from dashboard / project
  // pages so admins see "Working on: <name>" only when accurate.
  if (!viewing && session.user.id) {
    try {
      await prisma.user.update({
        where: { id: session.user.id },
        data: { currentDiagramId: diagram.id, currentDiagramName: diagram.name },
      });
    } catch { /* best-effort, ignore */ }
  }

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

  const impersonationMode = viewing ? getImpersonationMode(cookieStore) : undefined;

  // Per-diagram element-count cap for the effective user. Admins
  // (SUPERUSER_EMAILS) bypass entirely so we pass `null` to disable
  // the client-side gate for them. The check picks the BPMN or non-
  // BPMN limit based on the diagram's type.
  const effectiveUser = await prisma.user.findUnique({
    where: { id: effectiveUserId },
    select: {
      email: true,
      subscriptionLevel: {
        select: {
          maxBpmnElementsPerDiagram: true,
          maxNonBpmnElementsPerDiagram: true,
        },
      },
    },
  });
  const effectiveIsAdmin = effectiveUser ? SUPERUSER_EMAILS.has(effectiveUser.email) : false;
  const elementCountLimit = (effectiveIsAdmin || reviewerAccess)
    ? null
    : diagram.type === "bpmn"
    ? effectiveUser?.subscriptionLevel?.maxBpmnElementsPerDiagram ?? null
    : effectiveUser?.subscriptionLevel?.maxNonBpmnElementsPerDiagram ?? null;

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
        readOnly={viewing && impersonationMode === "view"}
        viewingAsName={viewingAsName}
        viewingAsEmail={viewingAsEmail}
        impersonationMode={impersonationMode}
        version={commitCount}
        elementCountLimit={elementCountLimit}
      />
  );
}
