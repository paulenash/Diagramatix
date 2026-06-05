import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import { getEffectiveUserId, isReadOnlyImpersonation } from "@/app/lib/superuser";
import { gateLimit } from "@/app/lib/subscription-route";
import {
  getCurrentOrgId,
  requireRole,
  requireProjectAccess,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let userId = session.user.id;
  try { userId = getEffectiveUserId(session, await cookies()); } catch { /* fallback */ }

  let orgId: string;
  try {
    orgId = await getCurrentOrgId(session, await cookies());
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  // Surface any diagram the caller can reach via one of three paths:
  //   • they created it (userId === caller),
  //   • they're the assigned Diagram Owner (the per-diagram
  //     accountability field introduced with sharing — they may not
  //     have created it but they are responsible for it), or
  //   • the diagram lives in a project shared with them.
  //
  // orgId scopes ONLY the "created it" branch. Diagram-owner and
  // project-share rows surface regardless of which Org they live in,
  // mirroring the same rule as the /api/projects GET list (a
  // cross-org share that the recipient explicitly received shouldn't
  // vanish just because they're in a different Org by default).
  const diagrams = await prisma.diagram.findMany({
    where: {
      OR: [
        { userId, orgId },
        { diagramOwnerId: userId },
        { project: { shares: { some: { userId } } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      projectId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(diagrams);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch {
    // cookies() may fail in some contexts — if so, proceed normally
  }

  const body = await req.json();
  const { name, type = "context", projectId, data, colorConfig, displayMode } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Two write-paths converge here:
  //   • projectId supplied → access is gated by the caller's project role
  //     (edit or owner). The diagram lives in that project's Org, and the
  //     diagramOwnerId default is the project owner (= the accountable
  //     person for new diagrams in this project).
  //   • no projectId → orphan diagram in the caller's active Org. Standard
  //     org-role gate. Owner defaults to the caller.
  let orgId: string;
  let projectFontConfig: Record<string, unknown> | null = null;
  let diagramOwnerId: string = session.user.id;
  if (projectId) {
    let projectOwnerUserId: string;
    try {
      const access = await requireProjectAccess(session, await cookies(), projectId, "edit");
      orgId = access.projectOrgId;
      projectOwnerUserId = access.ownerUserId;
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { fontConfig: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectFontConfig = (project.fontConfig as Record<string, unknown> | null) ?? null;
    // New diagram's owner-of-record defaults to the project owner — the
    // person accountable for everything in the project until someone
    // explicitly reassigns it.
    diagramOwnerId = projectOwnerUserId;
  } else {
    try {
      ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
    } catch (err) {
      if (err instanceof OrgContextError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      throw err;
    }
  }

  // Subscription caps. Order matters: archimate cap is total-across-account
  // and should fire first when it applies, so the user gets the most
  // relevant message ("you've used your archimate allotment") instead of
  // a per-project cap message that's actually OK in their case.
  if (type === "archimate") {
    const archimateBlock = await gateLimit(session.user.id, "archimateDiagramsTotal");
    if (archimateBlock) return archimateBlock;
  }
  if (projectId) {
    const perTypeBlock = await gateLimit(
      session.user.id,
      "diagramsPerTypePerProject",
      { projectId, diagramType: type },
    );
    if (perTypeBlock) return perTypeBlock;
  }

  // Merge project typography defaults into the new diagram's data, unless
  // the caller already provided values. Per-diagram overrides win; project
  // defaults fill the gaps.
  const baseData = (data ?? EMPTY_DIAGRAM) as Record<string, unknown>;
  const FONT_KEYS = ["fontSize", "connectorFontSize", "titleFontSize", "poolFontSize", "laneFontSize"] as const;
  const seededData: Record<string, unknown> = { ...baseData };
  if (projectFontConfig) {
    for (const k of FONT_KEYS) {
      const projVal = projectFontConfig[k];
      if (typeof projVal === "number" && seededData[k] === undefined) {
        seededData[k] = projVal;
      }
    }
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: name.trim(),
      type,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: seededData as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(colorConfig ? { colorConfig: colorConfig as any } : {}),
      ...(displayMode ? { displayMode } : {}),
      userId: session.user.id,
      diagramOwnerId,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json(diagram, { status: 201 });
}
