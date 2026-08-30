/**
 * One PartnerRequest row per HTTP call, written by a wrapper rather than by each
 * route.
 *
 * WHY AT THE EDGE. A PartnerJob row only exists for a POST that got far enough
 * to be accepted. The things an integration actually goes wrong on — a 401 from
 * a wrong header, a 413 from an oversized document, malformed JSON, a poll storm
 * hitting 429 — never create a job at all. Logging inside the handler would miss
 * every one of them, and those are exactly the calls you need to see when
 * somebody says "it doesn't work".
 *
 * WHY A WRAPPER. So a route cannot forget. A source-text tripwire test asserts
 * that every route under `app/api/public/**` is wrapped, which is cheaper than
 * hoping.
 *
 * WHAT IS KEPT is decided by the key's phase, never by this file — see
 * `types.ts`. In `live` a row carries sizes, hashes, status, timing and an error
 * code and nothing else.
 */
import { prisma } from "@/app/lib/db";
import { clientIp } from "@/app/lib/rateLimit";
import { newRef } from "./errors";
import { BODY_CAPTURE_LIMIT } from "./types";

/** What the wrapper needs back from a handler to log it accurately. */
export interface PartnerHandlerResult {
  response: Response;
  /** Set once the key is known — a failed auth leaves these undefined, and the
   *  row is still written. */
  apiKeyId?: string;
  keyPrefix?: string;
  /** Whether this key is currently capturing bodies. */
  capturing?: boolean;
  errorCode?: string;
  jobId?: string;
}

export type PartnerHandler = (req: Request, ref: string) => Promise<PartnerHandlerResult>;

/** Redact anything that could carry the key itself. The prefix is enough to
 *  identify which key was used; the key is never written anywhere. */
function safeHeaders(h: Headers, keyPrefix?: string): string {
  const out: Record<string, string> = {};
  for (const [k, v] of h.entries()) {
    const lk = k.toLowerCase();
    out[k] = lk === "authorization" || lk === "x-api-key" ? `[redacted${keyPrefix ? ` ${keyPrefix}…` : ""}]` : v;
  }
  return JSON.stringify(out);
}

const clip = (s: string) =>
  s.length <= BODY_CAPTURE_LIMIT ? s : `${s.slice(0, BODY_CAPTURE_LIMIT)}…[${s.length} bytes total]`;

/**
 * Wrap a public route handler. Always returns the handler's response — a logging
 * failure must never become a caller-visible failure.
 */
export function withPartnerLogging(handler: PartnerHandler) {
  return async (req: Request): Promise<Response> => {
    const ref = newRef();
    const started = Date.now();
    const url = new URL(req.url);

    // Read the body ONCE, here, and hand the handler a clone — otherwise a
    // handler that consumes the stream leaves nothing to log, and a handler
    // that does not consume it leaves the request unusable.
    let bodyText = "";
    let forHandler = req;
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyText = await req.text();
      forHandler = new Request(req.url, {
        method: req.method,
        headers: req.headers,
        body: bodyText,
      });
    }

    let result: PartnerHandlerResult;
    try {
      result = await handler(forHandler, ref);
    } catch (err) {
      // A handler that throws still gets a row — an unexplained 500 is precisely
      // the call you go looking for later.
      console.error(`[partner:${ref}] unhandled in ${req.method} ${url.pathname}:`, err);
      result = {
        response: new Response(
          JSON.stringify({ error: { code: "server_error", message: "Something went wrong at our end. Quote the ref if you report this." }, ref }),
          { status: 500, headers: { "Content-Type": "application/json", "X-Diagramatix-Request-Id": ref } },
        ),
        errorCode: "server_error",
      };
    }

    // Read the response body for logging without consuming the caller's copy.
    const cloned = result.response.clone();
    const responseText = await cloned.text().catch(() => "");

    const capturing = result.capturing === true;
    void prisma.partnerRequest
      .create({
        data: {
          ref,
          apiKeyId: result.apiKeyId ?? null,
          keyPrefix: result.keyPrefix ?? null,
          method: req.method,
          path: url.pathname,
          status: result.response.status,
          durationMs: Date.now() - started,
          ip: clientIp(req.headers),
          userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
          requestBytes: Buffer.byteLength(bodyText, "utf8"),
          responseBytes: Buffer.byteLength(responseText, "utf8"),
          errorCode: result.errorCode ?? null,
          jobId: result.jobId ?? null,
          requestBody: capturing ? clip(bodyText) : null,
          responseBody: capturing ? clip(responseText) : null,
          requestHeaders: capturing ? safeHeaders(req.headers, result.keyPrefix) : null,
        },
      })
      .catch((e) => console.error(`[partner:${ref}] could not log the request:`, e));

    // Every response carries the ref, so a caller can quote it.
    const headers = new Headers(result.response.headers);
    headers.set("X-Diagramatix-Request-Id", ref);
    return new Response(result.response.body, {
      status: result.response.status,
      statusText: result.response.statusText,
      headers,
    });
  };
}
