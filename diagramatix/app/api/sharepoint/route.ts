import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listSites, searchSites, listDrives, listDriveRoot, listFolder, getItem, getMyDrive, listMyDriveRoot, listMyDriveFolder } from "@/app/lib/sharepoint";

function getMsToken(session: any): string | null {
  return session?.msAccessToken ?? null;
}

/**
 * GET /api/sharepoint?action=sites                          — list all sites
 * GET /api/sharepoint?action=sites&q=<query>                — search sites
 * GET /api/sharepoint?action=drives&siteId=<id>             — list drives for a site
 * GET /api/sharepoint?action=files&driveId=<id>             — list root of a drive
 * GET /api/sharepoint?action=files&driveId=<id>&itemId=<id> — list folder contents
 * GET /api/sharepoint?action=item&driveId=<id>&itemId=<id>  — get single item metadata
 * GET /api/sharepoint?action=mydrive                        — get user's OneDrive info
 * GET /api/sharepoint?action=myfiles                        — list OneDrive root
 * GET /api/sharepoint?action=myfiles&itemId=<id>            — list OneDrive folder
 */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = getMsToken(session);
  if (!token) {
    return NextResponse.json({ error: "Microsoft account not connected" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get("action");

  try {
    switch (action) {
      case "sites": {
        const q = searchParams.get("q");
        const sites = q ? await searchSites(token, q) : await listSites(token);
        return NextResponse.json(sites);
      }

      case "drives": {
        const siteId = searchParams.get("siteId");
        if (!siteId) return NextResponse.json({ error: "siteId required" }, { status: 400 });
        const drives = await listDrives(token, siteId);
        return NextResponse.json(drives);
      }

      case "files": {
        const driveId = searchParams.get("driveId");
        if (!driveId) return NextResponse.json({ error: "driveId required" }, { status: 400 });
        const itemId = searchParams.get("itemId");
        const items = itemId
          ? await listFolder(token, driveId, itemId)
          : await listDriveRoot(token, driveId);
        return NextResponse.json(items);
      }

      case "item": {
        const driveId = searchParams.get("driveId");
        const itemId = searchParams.get("itemId");
        if (!driveId || !itemId) return NextResponse.json({ error: "driveId and itemId required" }, { status: 400 });
        const item = await getItem(token, driveId, itemId);
        return NextResponse.json(item);
      }

      case "mydrive": {
        const drive = await getMyDrive(token);
        return NextResponse.json(drive);
      }

      case "myfiles": {
        const itemId = searchParams.get("itemId");
        const items = itemId
          ? await listMyDriveFolder(token, itemId)
          : await listMyDriveRoot(token);
        return NextResponse.json(items);
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err: any) {
    console.error("[sharepoint] API error:", err?.message ?? err);
    const status = err?.statusCode ?? 500;
    return NextResponse.json({ error: err?.message ?? "SharePoint request failed" }, { status });
  }
}
