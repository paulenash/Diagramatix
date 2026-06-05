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
import { tryGetCurrentOrgId, getDiagramAccess } from "@/app/lib/auth/orgContext";
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

  // Access resolution: owner, edit-share, view-share, or legacy orphan
  // owned by the caller all pass. Project-shared users now reach the
  // editor — that's the headline shift for this feature.
  const diagramAccess = await getDiagramAccess(effectiveUserId, id);
  let diagram = diagramAccess
    ? await prisma.diagram.findUnique({ where: { id } })
    : null;

  // Review Mode access (Phase 3): a diagram opened with ?review= that the
  // user doesn't own is allowed IF they're an assigned reviewer on it.
  // Reviewer access is orthogonal to the share model and stays untouched.
  let reviewerAccess = false;
  if (!diagram && reviewParam && await isAssignedReviewer(session.user.id, id)) {
    diagram = await prisma.diagram.findUnique({ where: { id } });
    reviewerAccess = !!diagram;
  }

  // Redirect rather than notFound() so the not-found chunk-loading
  // path (a Next.js 16 known issue producing ChunkLoadError +
  // _not-found InvariantError) is sidestepped.
  if (!diagram) redirect("/dashboard");

  // The diagram's effective project role drives two UI decisions:
  //  • whether the editor is writable at all (handled downstream by
  //    the existing readOnly flag — non-owners with VIEW share will
  //    arrive here, but the PUT route still rejects their saves), and
  //  • whether the Diagram Owner sub-section is editable (project
  //    owner only). Reviewer access bypasses both: reviewers neither
  //    inherit a project role nor get the owner picker.
  const projectRole: "owner" | "edit" | "view" | null = reviewerAccess
    ? null
    : diagramAccess?.role ?? null;
  const isProjectOwner = projectRole === "owner" && diagram.projectId !== null;
  const isReadOnlyShare = projectRole === "view";

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

  // Diagram Owner sub-section data. Three pieces:
  //
  //   1. The current owner-of-record (diagramOwnerId → user identity).
  //      Surfaced as a name+email pair; may be null for legacy diagrams
  //      whose backfill missed them or whose owner was later deleted.
  //
  //   2. The candidate pool for the owner picker — project owner plus
  //      every user the project is shared with. Reusing the same set
  //      that powers the share dialog keeps "people who can edit" and
  //      "people who can be marked accountable" in sync.
  //
  //   3. Whether the picker is editable for the caller (project-owner
  //      only). The page can decide this server-side because both
  //      facts are already in hand: diagram.projectId + projectRole.
  let diagramOwner: { id: string; name: string | null; email: string } | null = null;
  let diagramOwnerCandidates: { id: string; name: string | null; email: string }[] = [];
  if (diagram.diagramOwnerId) {
    diagramOwner = await prisma.user.findUnique({
      where: { id: diagram.diagramOwnerId },
      select: { id: true, name: true, email: true },
    });
  }
  if (diagram.projectId) {
    const project = await prisma.project.findUnique({
      where: { id: diagram.projectId },
      select: {
        user: { select: { id: true, name: true, email: true } },
        shares: {
          select: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (project) {
      // Dedup on user.id — the project owner is always included, then
      // each sharee on top. Stable order: owner first, sharees by
      // name/email.
      const seen = new Set<string>();
      diagramOwnerCandidates = [];
      if (project.user) {
        diagramOwnerCandidates.push(project.user);
        seen.add(project.user.id);
      }
      const sharedUsers = project.shares
        .map(s => s.user)
        .filter(u => {
          if (seen.has(u.id)) return false;
          seen.add(u.id);
          return true;
        })
        .sort((a, b) =>
          ((a.name ?? a.email).localeCompare(b.name ?? b.email)),
        );
      diagramOwnerCandidates.push(...sharedUsers);
      // Defence-in-depth: if the current owner-of-record is somehow
      // outside the pool (e.g. a share was revoked after assignment),
      // surface them so the UI doesn't render a blank.
      if (diagramOwner && !seen.has(diagramOwner.id)) {
        diagramOwnerCandidates.push(diagramOwner);
      }
    }
  }

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
        readOnly={(viewing && impersonationMode === "view") || isReadOnlyShare}
        viewingAsName={viewingAsName}
        viewingAsEmail={viewingAsEmail}
        impersonationMode={impersonationMode}
        version={commitCount}
        elementCountLimit={elementCountLimit}
        initialDiagramOwner={diagramOwner}
        diagramOwnerCandidates={diagramOwnerCandidates}
        canEditDiagramOwner={isProjectOwner}
      />
  );
}
