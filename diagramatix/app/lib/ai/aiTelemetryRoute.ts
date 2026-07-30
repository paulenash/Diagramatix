// Server-only convenience for AI route handlers: resolve the caller's active org
// from cookies and BUILD the AI telemetry context. Kept separate from
// aiTelemetry.ts so the makeAiClient seam (which imports aiTelemetry) doesn't pull
// in next/headers + orgContext. Routes that ALREADY have orgId in hand
// (mining / simulation / compare) build the context inline instead.
//
// IMPORTANT — this helper only RESOLVES the context; the route must ENTER it in
// its OWN body: `enterAiContext(await resolveAiRouteContext(session, POINT))`.
// enterAiContext uses AsyncLocalStorage.enterWith, which sets the store on the
// CURRENT async frame. If the enterWith ran INSIDE this async helper (after its
// own `await`), the store would NOT propagate back to the route handler's
// continuation — the seam would then read no context and record the row as
// "unknown". Resolving here + entering in the route keeps enterWith on the
// handler's frame so it survives the route's remaining awaits. (This was a real
// mis-attribution bug: every route using the old enter-in-helper form logged its
// AI usage as "unknown".)
import { cookies } from "next/headers";
import { tryGetCurrentOrgId } from "@/app/lib/auth/orgContext";
import type { AiContext } from "./aiTelemetry";

interface SessionLike { user?: { id?: string | null } | null }

/** Resolve org from the request cookies and BUILD the AI telemetry context.
 *  The caller enters it: `enterAiContext(await resolveAiRouteContext(session, POINT))`. */
export async function resolveAiRouteContext(
  session: SessionLike | null,
  invocationPoint: string,
): Promise<AiContext> {
  const orgId = await tryGetCurrentOrgId(session as never, await cookies());
  return { userId: session?.user?.id ?? null, orgId, invocationPoint };
}
