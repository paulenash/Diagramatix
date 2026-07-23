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
  // Deployment-level SharePoint availability: the Microsoft Entra ID app must be
  // configured (AZURE_* env) or SharePoint import/export/link can't work at all.
  // Surfaced so the client can GREY OUT SharePoint menu options when unavailable.
  const sharePointConfigured = !!process.env.AZURE_CLIENT_ID?.trim() && !!process.env.AZURE_TENANT_ID?.trim();
  return NextResponse.json({ policy, sharePointConfigured });
}
