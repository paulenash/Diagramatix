import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { importVisioV3 } from "@/app/lib/diagram/v3/importVisioV3";
import { isImpersonating } from "@/app/lib/superuser";
import {
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

/**
 * POST /api/import/visio-v3
 * Multipart upload of a `.vsdx` file → creates a new BPMN diagram in the
 * caller's current org. Returns `{ diagram, warnings }`.
 *
 * Form fields:
 *  - file (required): the .vsdx binary
 *  - projectId (optional): place the new diagram in this project (must
 *    belong to the calling user + their current org)
 *  - name (optional): override the default diagram name
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isImpersonating(session, cookieStore)) {
      return NextResponse.json(
        { error: "Read-only: viewing another user" },
        { status: 403 },
      );
    }
  } catch {
    /* cookies() may fail in some contexts — proceed normally */
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart upload" },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing 'file' field" }, { status: 400 });
  }
  const upload = file as File;

  const rawName =
    (form.get("name") as string | null)?.trim() ||
    upload.name.replace(/\.vsdx$/i, "") ||
    "Imported Visio Diagram";
  const projectId =
    (form.get("projectId") as string | null) &&
    (form.get("projectId") as string).length > 0
      ? (form.get("projectId") as string)
      : null;

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id, orgId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  let parsed: Awaited<ReturnType<typeof importVisioV3>>;
  try {
    const buf = await upload.arrayBuffer();
    parsed = await importVisioV3(buf);
  } catch (err) {
    return NextResponse.json(
      {
        error: `Failed to parse .vsdx: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      },
      { status: 400 },
    );
  }

  const diagram = await prisma.diagram.create({
    data: {
      name: rawName,
      type: "bpmn",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: parsed.data as any,
      userId: session.user.id,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
  });

  return NextResponse.json(
    { diagram, warnings: parsed.warnings, stats: parsed.stats },
    { status: 201 },
  );
}
