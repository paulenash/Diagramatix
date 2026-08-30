/**
 * SuperAdmin — the harness proxy.
 *
 * The harness page does NOT hold a partner key. It posts here, and this route
 * attaches the chosen key and calls the real public API over HTTP on the
 * loopback, then relays the poll.
 *
 * That indirection is the point, not ceremony. A live partner key in page
 * JavaScript is a burned key, and putting one there on the very screen that
 * demonstrates the API would contradict the rule everywhere else in this
 * feature. The proxy keeps the key server-side while still exercising the whole
 * path — header auth, the request log, rate limits, the job table, polling — so
 * the harness's own calls appear in the Usage screen alongside a partner's.
 *
 * It also refuses to hand the key back: the response is whatever the public API
 * said, and nothing else.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser } from "@/app/lib/superuser";
import { mintIngestKey } from "@/app/lib/mining/sourceAuth";
import { recallHarnessSecret, rememberHarnessSecret } from "@/app/lib/partner/harnessSecret";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const forbidden = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

/**
 * The raw key is never stored, so the harness cannot read one back from a hash.
 * It uses the secret remembered at mint time; only if that is gone — a restart —
 * does it rotate, and it says so in the result rather than leaving somebody with
 * a key that quietly stopped working.
 */
async function secretFor(apiKeyId: string): Promise<{ secret: string; rotated: boolean } | null> {
  const cached = recallHarnessSecret(apiKeyId);
  if (cached) return { secret: cached, rotated: false };

  const row = await prisma.apiKey.findUnique({
    where: { id: apiKeyId },
    select: { id: true, phase: true, revokedAt: true },
  });
  if (!row || row.revokedAt) return null;
  // Only a key we own may be rotated silently. Rotating a partner's key here
  // would break their integration without telling them.
  if (row.phase !== "internal") return null;

  const { key, hash, prefix } = mintIngestKey();
  await prisma.apiKey.update({ where: { id: apiKeyId }, data: { keyHash: hash, keyPrefix: prefix } });
  rememberHarnessSecret(apiKeyId, key);
  return { secret: key, rotated: true };
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) return forbidden();

  const body = (await req.json().catch(() => null)) as {
    apiKeyId?: string;
    /** Poll an existing job instead of submitting a new one. */
    jobId?: string;
    /** The case this run replays, so its history accumulates. */
    harnessCaseId?: string;
    payload?: Record<string, unknown>;
  } | null;

  const apiKeyId = body?.apiKeyId?.trim();
  if (!apiKeyId) return NextResponse.json({ error: "Choose a key" }, { status: 400 });

  const got = await secretFor(apiKeyId);
  if (!got) {
    return NextResponse.json(
      { error: "That key cannot be driven from the harness. Only an internal-phase key can be, because using one means rotating its secret — which would break a partner's integration." },
      { status: 400 },
    );
  }

  const { secret, rotated } = got;
  const origin = new URL(req.url).origin;
  const headers = { "Content-Type": "application/json", "X-Api-Key": secret };

  try {
    if (body?.jobId) {
      const r = await fetch(`${origin}/api/public/v1/process-map/${encodeURIComponent(body.jobId)}`, {
        headers: { "X-Api-Key": secret }, cache: "no-store",
      });
      // Relayed verbatim — the harness should see exactly what a partner sees.
      return NextResponse.json(await r.json().catch(() => ({})), { status: r.status });
    }

    const r = await fetch(`${origin}/api/public/v1/process-map`, {
      method: "POST",
      // The case id rides in a header rather than the body: the body is the
      // partner contract, and adding a private field to it would mean the
      // harness was not sending what a partner sends.
      headers: { ...headers, ...(body?.harnessCaseId ? { "X-Harness-Case": body.harnessCaseId } : {}) },
      body: JSON.stringify(body?.payload ?? {}),
    });
    const out = await r.json().catch(() => ({}));
    if (r.ok && body?.harnessCaseId) {
      await prisma.harnessCase.update({
        where: { id: body.harnessCaseId },
        data: { runCount: { increment: 1 }, lastRunAt: new Date() },
      }).catch(() => {});
    }
    // Said out loud when it happens, because it invalidates a key somebody may
    // be holding.
    return NextResponse.json(rotated ? { ...out, keyRotated: true } : out, { status: r.status });
  } catch (e) {
    console.error("[harness] proxy failed:", e);
    return NextResponse.json({ error: "Could not reach the API from the harness." }, { status: 502 });
  }
}
