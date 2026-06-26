import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { downloadFileBytes, getItem } from "@/app/lib/sharepoint";
import { getMsAccessToken } from "@/app/lib/sharepoint-token";

/**
 * GET /api/sharepoint/download?driveId=<id>&itemId=<id>
 *
 * Streams the raw bytes of a SharePoint / OneDrive file back to the client so
 * it can be fed into the existing import pipelines (JSON / XML, .vsdx, .bpmn).
 * Binary-safe.
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const token = await getMsAccessToken(request);
  if (!token) {
    return NextResponse.json({ error: "Microsoft account not connected" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const driveId = searchParams.get("driveId");
  const itemId = searchParams.get("itemId");
  if (!driveId || !itemId) {
    return NextResponse.json({ error: "driveId and itemId required" }, { status: 400 });
  }

  try {
    const meta = await getItem(token, driveId, itemId);
    const bytes = await downloadFileBytes(token, driveId, itemId);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": meta.file?.mimeType ?? "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(meta.name)}"`,
        "X-Diagramatix-Filename": meta.name,
      },
    });
  } catch (err: any) {
    console.error("[sharepoint/download] error:", err?.message ?? err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.message ?? "Download failed" }, { status });
  }
}
