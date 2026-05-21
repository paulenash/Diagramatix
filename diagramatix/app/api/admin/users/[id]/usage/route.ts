/**
 * Admin: usage snapshot for a single user.
 *
 *   GET /api/admin/users/[id]/usage
 *     Returns the full UsageSnapshot for the named user.
 *     isSuperuser-gated.
 *
 * The UsagePopover component hits this on every open (no client cache)
 * so admins see fresh counts after a Change Tier action.
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { getUsageSnapshot } from "@/app/lib/subscription";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const snapshot = await getUsageSnapshot(id);
  if (!snapshot) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}
