import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { EMPTY_DIAGRAM } from "@/app/lib/diagram/types";
import { getEffectiveUserId, isImpersonating } from "@/app/lib/superuser";
import {
  getCurrentOrgId,
  requireRole,
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

  const diagrams = await prisma.diagram.findMany({
    where: { userId, orgId },
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
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json({ error: "Read-only: viewing another user" }, { status: 403 });
    }
  } catch {
    // cookies() may fail in some contexts — if so, proceed normally
  }

  let orgId: string;
  try {
    ({ orgId } = await requireRole(session, await cookies(), WRITE_ROLES));
  } catch (err) {
    if (err instanceof OrgContextError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }

  const body = await req.json();
  const { name, type = "context", projectId, data, colorConfig, displayMode } = body;

  if (!name?.trim()) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  // Validate project ownership AND org match if supplied. Capture
  // project.fontConfig so we can seed the new diagram with the project-level
  // typography defaults.
  let projectFontConfig: Record<string, unknown> | null = null;
  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id, orgId },
      select: { id: true, fontConfig: true },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    projectFontConfig = (project.fontConfig as Record<string, unknown> | null) ?? null;
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
      orgId,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json(diagram, { status: 201 });
}
