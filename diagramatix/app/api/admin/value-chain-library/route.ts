import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { libraryGet, libraryPost, type LibrarySession } from "@/app/lib/valueChain/libraryAdmin";

/**
 * SuperAdmin — the MASTER Process Repository library. The handlers are shared with the OrgAdmin's own repository
 * (app/api/org-admin/value-chain-library) and live in app/lib/valueChain/libraryAdmin.ts; this route authorises SuperAdmin and passes the
 * master scope (orgId ""). See that file for what each action does.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return libraryGet(req, "");
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return libraryPost(req, session as LibrarySession, "");
}
