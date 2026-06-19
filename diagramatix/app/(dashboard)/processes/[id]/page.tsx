import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { getDiagramAccess } from "@/app/lib/auth/orgContext";
import { getEffectiveUserId } from "@/app/lib/superuser";
import { ProcessView } from "./ProcessView";
import type { DiagramData, DiagramType } from "@/app/lib/diagram/types";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import type { SymbolColorConfig } from "@/app/lib/diagram/colors";
import type { DisplayMode } from "@/app/lib/diagram/displayMode";

// /processes/[id] — read-only published-version viewer for business users
// (and a preview for owners/editors/viewers). Hydrates from the diagram's
// latest non-superseded PublishedVersion — drafts never leak to this route.
//
// `?bundle=<bundleId>` scopes the "Back to bundle" affordance and seeds
// the link-traversal stack so the user can return to the bundle index.
//
// Access (via getDiagramAccess):
//   • owner / edit / view share → previews the latest published version.
//     Useful for the owner to "see what business users see".
//   • business-user (via PublicationBundleAudience) → the primary case.
//   • null → 403 redirect to dashboard.
type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ bundle?: string }>;
};

export default async function ProcessPage({ params, searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const { bundle: bundleIdParam } = await searchParams;

  // Honour SuperAdmin impersonation: judge access as the impersonated user so
  // the admin can open exactly the published diagrams that user can.
  const effectiveUserId = getEffectiveUserId(session, await cookies());
  const access = await getDiagramAccess(effectiveUserId, id);
  if (!access) redirect("/dashboard");

  // Find the latest non-superseded PublishedVersion. If none exists this
  // diagram has never been published — redirect to the dashboard rather
  // than rendering an empty viewer; the route only makes sense once
  // there's a snapshot to read.
  const diagram = await prisma.diagram.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      type: true,
      currentPublishedVersionId: true,
      diagramOwner: { select: { id: true, name: true, email: true } },
    },
  });
  if (!diagram?.currentPublishedVersionId) redirect("/dashboard");

  const version = await prisma.publishedVersion.findUnique({
    where: { id: diagram.currentPublishedVersionId },
    select: {
      id: true,
      versionNumber: true,
      publishedAt: true,
      releaseNotes: true,
      data: true,
      colorConfig: true,
      displayMode: true,
      publishedBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!version) redirect("/dashboard");

  // If the access path was business-user, prefer that bundle's id for
  // the Back affordance; otherwise honour the ?bundle= query param if
  // the user came from a bundle index page.
  const effectiveBundleId = access.bundleId ?? bundleIdParam ?? null;

  const data: DiagramData =
    version.data && typeof version.data === "object" && !Array.isArray(version.data)
      ? (version.data as unknown as DiagramData)
      : EMPTY_DIAGRAM;
  const colorConfig: SymbolColorConfig =
    version.colorConfig && typeof version.colorConfig === "object" && !Array.isArray(version.colorConfig)
      ? (version.colorConfig as unknown as SymbolColorConfig)
      : {};

  // Process Owner label is inside the diagram data (free-text from the
  // canvas). Read it for the title-bar pill alongside the accountable
  // diagramOwner.
  const processOwner = (data.processOwner ?? null) as { name?: string; email?: string } | null;

  return (
    <ProcessView
      diagramId={diagram.id}
      diagramName={diagram.name}
      diagramType={diagram.type as DiagramType}
      data={data}
      colorConfig={colorConfig}
      displayMode={(version.displayMode as DisplayMode) ?? "normal"}
      version={{
        versionNumber: version.versionNumber,
        publishedAt: version.publishedAt.toISOString(),
        releaseNotes: version.releaseNotes,
        publishedBy: version.publishedBy,
      }}
      diagramOwner={diagram.diagramOwner}
      processOwnerLabel={processOwner}
      bundleId={effectiveBundleId}
    />
  );
}
