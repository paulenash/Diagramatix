/**
 * GET /api/public/v1/whoami — "is my key working?"
 *
 * The first thing a partner calls and the first thing to check when they say it
 * is broken. Deliberately does no work: no AI, no database writes beyond the
 * usage stamp, no quota. If this returns 200 the key, the header, the transport
 * and the org binding are all correct, which removes four suspects from every
 * later conversation.
 *
 *   curl -H "X-Api-Key: dgxk_…" https://app.diagramatix.com.au/api/public/v1/whoami
 *
 * Note what it does NOT return: the org id, the service user, the project id.
 * A partner does not need our internal identifiers, and a key that leaks them
 * makes a support screenshot a small disclosure. The org NAME is enough for a
 * human to confirm they are pointed at the right tenant.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { authenticatePartner, touchKey } from "@/app/lib/partner/auth";
import { withPartnerLogging } from "@/app/lib/partner/logging";
import { partnerServerError } from "@/app/lib/partner/errors";
import { SCOPE_PROCESS_MAPPING } from "@/app/lib/partner/types";
import { clientIp } from "@/app/lib/rateLimit";

export const dynamic = "force-dynamic";

export const GET = withPartnerLogging(async (req, ref) => {
  const auth = await authenticatePartner(req, SCOPE_PROCESS_MAPPING, ref);
  if (!auth.ok) return { response: auth.response, errorCode: auth.code };

  const c = auth.caller;
  try {
    await touchKey(c.apiKeyId, clientIp(req.headers));
    const org = await prisma.org.findUnique({ where: { id: c.orgId }, select: { name: true } });

    return {
      response: NextResponse.json({
        ok: true,
        key: { name: c.keyName, prefix: c.keyPrefix, scopes: c.scopes },
        organisation: org?.name ?? null,
        // The phase is the partner's business: it tells them whether their test
        // data is being retained right now, which they are entitled to know.
        phase: c.phase,
        retainingRequestData: c.capturing,
        limits: { perMinute: c.rateLimitPerMin, perDay: c.dailyJobLimit },
        ref,
      }),
      apiKeyId: c.apiKeyId,
      keyPrefix: c.keyPrefix,
      capturing: c.capturing,
    };
  } catch (err) {
    return {
      response: partnerServerError(err, "GET /api/public/v1/whoami", ref),
      apiKeyId: c.apiKeyId,
      keyPrefix: c.keyPrefix,
      capturing: c.capturing,
      errorCode: "server_error",
    };
  }
});
