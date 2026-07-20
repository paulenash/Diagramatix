import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { gateOrgPolicy } from "@/app/lib/auth/orgPolicy";
import { uploadToFolder } from "@/app/lib/sharepoint";
import { getMsAccessToken } from "@/app/lib/sharepoint-token";

/**
 * POST /api/sharepoint/upload  (multipart/form-data)
 *   fields: driveId, folderItemId (optional — root if absent),
 *           filename, contentType, file (Blob)
 *
 * Uploads a Diagramatix export (XML / XSD / JSON / .vsdx) into the chosen
 * SharePoint or OneDrive folder. Binary-safe: the file part is read as bytes
 * so Visio .vsdx round-trips correctly.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Uploading an export to SharePoint pushes data OUT of the platform.
  const _pol = (await gateOrgPolicy(session, "allowSharePoint"))
    ?? (await gateOrgPolicy(session, "allowExternalExport"));
  if (_pol) return _pol;
  const token = await getMsAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: "Microsoft account not connected" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const driveId = form.get("driveId");
  const folderItemId = form.get("folderItemId");
  const filename = form.get("filename");
  const contentType = (form.get("contentType") as string | null) ?? "application/octet-stream";
  const file = form.get("file");

  if (typeof driveId !== "string" || typeof filename !== "string" || !(file instanceof Blob)) {
    return NextResponse.json({ error: "driveId, filename and file are required" }, { status: 400 });
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const item = await uploadToFolder(
      token,
      driveId,
      typeof folderItemId === "string" && folderItemId ? folderItemId : null,
      filename,
      bytes,
      contentType,
    );
    return NextResponse.json({ id: item.id, name: item.name, webUrl: item.webUrl });
  } catch (err: any) {
    console.error("[sharepoint/upload] error:", err?.message ?? err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.message ?? "Upload failed" }, { status });
  }
}
