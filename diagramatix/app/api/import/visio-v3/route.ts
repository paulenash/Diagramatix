import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { uploadSizeError } from "@/app/lib/uploadLimit";
import { importVisioV3 } from "@/app/lib/diagram/v3/importVisioV3";
import { validateDiagramData } from "@/app/lib/diagram/validateDiagram";
import { importVisioDomainV3, isDomainVisio } from "@/app/lib/diagram/v3/importVisioDomainV3";
import { isReadOnlyImpersonation, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { gateLimit, gateElementCount, recordUsage } from "@/app/lib/subscription-route";
import {
  requireRole,
  WRITE_ROLES,
  OrgContextError,
} from "@/app/lib/auth/orgContext";

/**
 * POST /api/import/visio-v3
 * Multipart upload of a `.vsdx` file → creates a new BPMN diagram in the
 * caller's current org, OR overwrites an existing diagram's data when
 * `overwriteDiagramId` is supplied. Returns `{ diagram, warnings, stats }`.
 *
 * Form fields:
 *  - file (required): the .vsdx binary
 *  - projectId (optional): place the new diagram in this project (must
 *    belong to the calling user + their current org)
 *  - name (optional): override the default diagram name
 *  - overwriteDiagramId (optional): if supplied, UPDATE that diagram's
 *    `data` field with the imported parse result instead of creating a
 *    new diagram. The diagram's name, project and type are preserved.
 *    Used by the in-editor "Import Visio" flow when the user agrees to
 *    overwrite a same-named diagram.
 *
 * Name-conflict handling (create flow only): if the resolved name
 * matches an existing diagram in the same project, the new diagram's
 * name is suffixed with a `dd-mm-yy hh:mm` timestamp so both diagrams
 * are visible side-by-side in the project tree.
 */
function timestampSuffix(): string {
  const d = new Date();
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${p(d.getFullYear() % 100)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cookieStore = await cookies();
    if (isReadOnlyImpersonation(session, cookieStore)) {
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
  const overwriteDiagramId =
    (form.get("overwriteDiagramId") as string | null)?.trim() || null;

  if (projectId) {
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: session.user.id, orgId },
    });
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
  }

  // Subscription cap: individual imports.
  const limitBlock = await gateLimit(session.user.id, "individualImports");
  if (limitBlock) return limitBlock;

  let parsed: Awaited<ReturnType<typeof importVisioV3>>;
  // Standard-UML domain diagrams use a separate importer + a "domain" type.
  // Detected up front so the BPMN path is entirely untouched for BPMN files.
  let resolvedType: "bpmn" | "domain" = "bpmn";
  try {
    const sizeErr = uploadSizeError(upload); // IO-01
    if (sizeErr) return NextResponse.json({ error: sizeErr }, { status: 413 });
    const buf = await upload.arrayBuffer();
    if (await isDomainVisio(buf)) {
      resolvedType = "domain";
      parsed = await importVisioDomainV3(buf);
    } else {
      parsed = await importVisioV3(buf);
    }
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

  // Domain (UML) import is SuperAdmin-only for now — it's still maturing,
  // mirroring the gated domain export. BPMN import is unaffected.
  if (resolvedType === "domain") {
    const email = session.user.email?.toLowerCase();
    if (!email || !SUPERUSER_EMAILS.has(email)) {
      return NextResponse.json({ error: "UML domain Visio import is not yet available." }, { status: 403 });
    }
  }

  // Element-count gate on the parsed diagram. Reject BEFORE we touch
  // the DB so the import counter isn't spent on an over-cap result.
  const elementBlock = await gateElementCount(session.user.id, resolvedType, parsed.data);
  if (elementBlock) return elementBlock;

  // ── Overwrite path ──
  if (overwriteDiagramId) {
    const existing = await prisma.diagram.findFirst({
      where: { id: overwriteDiagramId, userId: session.user.id, orgId },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Diagram to overwrite not found, or not owned by caller" },
        { status: 404 },
      );
    }
    const updated = await prisma.diagram.update({
      where: { id: overwriteDiagramId },
      // Also update the type — a domain .vsdx imported over a BPMN diagram must
      // switch to "domain" or it renders under the wrong engine.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { data: parsed.data as any, type: resolvedType },
    });
    return NextResponse.json(
      { diagram: updated, warnings: parsed.warnings, stats: parsed.stats, overwrote: true },
      { status: 200 },
    );
  }

  // ── Create path with name-conflict resolution ──
  // If the requested name already exists on another diagram in the same
  // project (or anywhere in the org if no project specified), suffix the
  // new diagram's name with a dd-mm-yy hh:mm timestamp so both remain
  // visible. Avoids silent same-name collisions while still preserving
  // the user's intent.
  let finalName = rawName;
  const conflict = await prisma.diagram.findFirst({
    where: {
      name: rawName,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
    select: { id: true },
  });
  if (conflict) {
    finalName = `${rawName} ${timestampSuffix()}`;
  }

  void validateDiagramData(parsed.data, { route: "import/visio-v3", mode: "log" });
  const diagram = await prisma.diagram.create({
    data: {
      name: finalName,
      type: resolvedType,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: parsed.data as any,
      userId: session.user.id,
      orgId,
      ...(projectId ? { projectId } : {}),
    },
  });

  // Record AFTER the diagram is committed so a failed parse doesn't burn quota.
  await recordUsage(session.user.id, "individualImports");
  return NextResponse.json(
    { diagram, warnings: parsed.warnings, stats: parsed.stats },
    { status: 201 },
  );
}
