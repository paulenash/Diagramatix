import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { uploadSizeError } from "@/app/lib/uploadLimit";
import { parsePcfWorkbook } from "@/app/lib/pcf/importPcfXlsx";
import { persistPcfFramework } from "@/app/lib/pcf/persistFramework";

/**
 * POST /api/admin/pcf/import  (multipart: file=.xlsx, variant, version, familyKey?, kNumber?)
 * Import an APQC PCF workbook as a GLOBAL reference framework. SuperAdmin only.
 * The bundled workbooks are seeded via scripts/seed-pcf-frameworks.ts; this is the
 * runtime path for prod bootstrap + new versions/industries. .xls not supported.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "file (.xlsx) required" }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return NextResponse.json({ error: ".xls is not supported — save the workbook as .xlsx first." }, { status: 400 });
  }
  const sizeErr = uploadSizeError(file);
  if (sizeErr) return NextResponse.json({ error: sizeErr }, { status: 413 });

  const variant = String(form?.get("variant") ?? "").trim();
  const version = String(form?.get("version") ?? "").trim();
  const familyKey = String(form?.get("familyKey") ?? "").trim() || variant.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const kNumber = String(form?.get("kNumber") ?? "").trim() || null;
  if (!variant || !version) return NextResponse.json({ error: "variant and version are required" }, { status: 400 });

  try {
    const parsed = await parsePcfWorkbook(await file.arrayBuffer());
    if (parsed.nodes.length === 0) return NextResponse.json({ error: "No PCF elements found — is this an APQC PCF workbook?" }, { status: 400 });
    const r = await persistPcfFramework(prisma, parsed, {
      orgId: null, kind: "reference", familyKey, name: `APQC PCF — ${variant}`, variant, version, sourceKNumber: kNumber,
    });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/admin/pcf/import]", message);
    return NextResponse.json({ error: `Import failed: ${message}` }, { status: 500 });
  }
}
