/**
 * SOP templates (per Org or per Project).
 *   GET  /api/sop-templates?projectId=… | ?orgId=…   → list (metadata, no bytes)
 *   POST /api/sop-templates  (multipart)              → create {scope, orgId|projectId, name, isDefault?, file?}
 *
 * A template's uploaded Word doc (.docx/.dotx) drives LOOK (fonts/heading styles,
 * adopted on export); section STRUCTURE stays the code default. Project templates
 * need project-edit; org templates need OrgAdmin.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { requireProjectAccess, requireOrgAdminFor, OrgContextError } from "@/app/lib/auth/orgContext";

const DOCX_EXT = /\.(docx|dotx)$/i;
const MAX_BYTES = 8 * 1024 * 1024;

async function gate(scope: "project" | "org", id: string): Promise<NextResponse | null> {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    if (scope === "project") await requireProjectAccess(session, await cookies(), id, "edit");
    else await requireOrgAdminFor(session, await cookies(), id);
  } catch (err) {
    if (err instanceof OrgContextError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const orgId = url.searchParams.get("orgId");
  if (!projectId && !orgId) return NextResponse.json({ error: "projectId or orgId required" }, { status: 400 });
  const denied = await gate(projectId ? "project" : "org", (projectId ?? orgId)!);
  if (denied) return denied;
  const rows = await prisma.sopTemplate.findMany({
    where: projectId ? { projectId } : { orgId },
    select: { id: true, name: true, isDefault: true, docxTemplateName: true, projectId: true, orgId: true, updatedAt: true },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return NextResponse.json({ templates: rows.map((r) => ({ ...r, hasDocx: !!r.docxTemplateName })) });
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart body required" }, { status: 400 });
  const scope = form.get("scope") === "org" ? "org" : "project";
  const scopeId = String(form.get(scope === "org" ? "orgId" : "projectId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const isDefault = String(form.get("isDefault") ?? "") === "true";
  if (!scopeId) return NextResponse.json({ error: `${scope}Id required` }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  const denied = await gate(scope, scopeId);
  if (denied) return denied;

  let docxTemplate: Uint8Array<ArrayBuffer> | null = null;
  let docxTemplateName: string | null = null;
  const file = form.get("file");
  if (file && typeof file !== "string") {
    if (!DOCX_EXT.test(file.name)) return NextResponse.json({ error: "Upload a .docx or .dotx Word template" }, { status: 400 });
    if (file.size > MAX_BYTES) return NextResponse.json({ error: "Template exceeds 8 MB" }, { status: 400 });
    docxTemplate = new Uint8Array(await file.arrayBuffer());
    docxTemplateName = file.name;
  }

  const created = await prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.sopTemplate.updateMany({ where: scope === "org" ? { orgId: scopeId } : { projectId: scopeId }, data: { isDefault: false } });
    }
    return tx.sopTemplate.create({
      data: {
        name,
        orgId: scope === "org" ? scopeId : null,
        projectId: scope === "project" ? scopeId : null,
        isDefault,
        docxTemplate,
        docxTemplateName,
      },
      select: { id: true },
    });
  });
  return NextResponse.json({ id: created.id });
}
