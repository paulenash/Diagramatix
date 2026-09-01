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
    artifact?: string;
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

  /**
   * Always call ourselves over PLAIN HTTP ON THE LOOPBACK, whatever the
   * incoming request looked like.
   *
   * Deriving the origin from `req.url` is wrong twice over. In a standalone
   * build that URL is rebuilt from headers, so the host comes back as the BIND
   * address (0.0.0.0) and the scheme as whatever a proxy declared — which on
   * Azure is https. Fetching https://0.0.0.0:3000 then speaks TLS at a plain
   * HTTP listener and fails with an SSL record error that says nothing about
   * the actual mistake.
   *
   * The app always listens on http, on its own port, on this machine — this
   * request is being served by it. So that is what we call. `localhost` is
   * avoided as well: Node resolves it to ::1 first, and an IPv4-only listener
   * refuses that.
   */
  const reqUrl = new URL(req.url);
  const port = process.env.PORT || reqUrl.port || "3000";
  const origin = process.env.HARNESS_BASE_URL || `http://127.0.0.1:${port}`;
  const headers = { "Content-Type": "application/json", "X-Api-Key": secret };

  try {
    // An artifact, fetched WITH the key and relayed as bytes. The browser cannot
    // ask for one directly: the key is server-side, and putting it in page
    // JavaScript to save a hop is exactly what the proxy exists to avoid.
    if (body?.jobId && body?.artifact) {
      const allowed = ["diagram.bpmn", "diagram.json", "diagram.pdf", "diagram.svg"];
      if (!allowed.includes(body.artifact)) {
        return NextResponse.json({ error: "Unknown artifact" }, { status: 400 });
      }
      const r = await fetch(
        `${origin}/api/public/v1/process-map/${encodeURIComponent(body.jobId)}/artifact/${body.artifact}`,
        { headers: { "X-Api-Key": secret }, cache: "no-store" },
      );
      const buf = Buffer.from(await r.arrayBuffer());
      return new NextResponse(new Uint8Array(buf), {
        status: r.status,
        headers: {
          "Content-Type": r.headers.get("content-type") ?? "application/octet-stream",
          "Cache-Control": "no-store",
        },
      });
    }

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
    // SuperAdmin-only screen, so the real cause goes back rather than being
    // swallowed: "could not reach the API" with nothing else is exactly the
    // sort of message that costs an hour.
    const cause = e instanceof Error ? (e.cause instanceof Error ? `${e.message}: ${e.cause.message}` : e.message) : String(e);
    console.error("[harness] proxy failed:", e);
    return NextResponse.json({
      error: `Could not reach the API from the harness (${origin}). ${cause}`,
      hint: "If the server was started before this feature was added, restart it — the public routes will not exist in an older build.",
    }, { status: 502 });
  }
}
