import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireNewChainAccess } from "@/app/lib/valueChain/newChainAccess";
import { attemptsRemaining, maxUserChainsPerOrg, userChainCount } from "@/app/lib/valueChain/newChain";

/**
 * GET — may this user see "Create a New Value Chain", and what is left to spend? The menu item and the wizard ask here instead of guessing from
 * the grid, so what they show is exactly what the create routes will accept (feature grid, the Expert floor, the Org's AI and role switches).
 * Reads only. `allowed:false` carries the reason; `attemptsLeft` is null when unlimited; `chainsMax` is null for a SuperAdmin.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ allowed: false, reason: "Unauthorized" }, { status: 401 });
  const access = await requireNewChainAccess(session);
  if (!access.ok) {
    const j = await access.response.json().catch(() => ({} as { error?: string }));
    return NextResponse.json({ allowed: false, reason: j.error ?? "Not available" });
  }
  const [left, have, max] = await Promise.all([attemptsRemaining(access.userId), userChainCount(access.orgId), maxUserChainsPerOrg()]);
  return NextResponse.json({ allowed: true, attemptsLeft: Number.isFinite(left) ? left : null, chainsUsed: have, chainsMax: access.isSuper ? null : max });
}
