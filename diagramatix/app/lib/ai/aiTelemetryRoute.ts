// Server-only convenience for AI route handlers: resolve the caller's active org
// from cookies and set the telemetry context in one line. Kept separate from
// aiTelemetry.ts so the makeAiClient seam (which imports aiTelemetry) doesn't pull
// in next/headers + orgContext. Routes that ALREADY have orgId in hand
// (mining / simulation / compare) should call enterAiContext directly instead.
import { cookies } from "next/headers";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import { enterAiContext } from "./aiTelemetry";

interface SessionLike { user?: { id?: string | null } | null }

/** Resolve org from the request cookies and enter the AI telemetry context. */
export async function enterAiRouteContext(
  session: SessionLike | null,
  invocationPoint: string,
): Promise<void> {
  const orgId = await tryGetCurrentOrgId(session as never, await cookies());
  enterAiContext({ userId: session?.user?.id ?? null, orgId, invocationPoint });
}
