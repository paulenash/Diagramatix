/**
 * GET /api/org/policy — the enterprise governance policy for the caller's ACTIVE
 * org (all-allowed when there's no org). Open to any signed-in user so the client
 * can hide/disable capabilities their org has turned off (the API routes enforce
 * it regardless). Mirrors the active-org context the route guards use.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { getOrgPolicy } from "@/app/lib/auth/orgPolicy";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const orgId = await tryGetCurrentOrgId(session, await cookies());
  const policy = await getOrgPolicy(orgId ?? "__none__"); // unknown id → all true
  return NextResponse.json({ policy });
}
