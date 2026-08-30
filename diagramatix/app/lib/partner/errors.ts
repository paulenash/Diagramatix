/**
 * The Partner API's error envelope.
 *
 * Deliberately UNLIKE the internal `{ error: string }` shape. This one is a
 * published contract: a third party writes code against these codes, so they are
 * a closed set with stable spellings, and the human-readable message is free to
 * change without breaking anybody.
 *
 *   { "error": { "code": "missing_input", "message": "…" }, "ref": "a1b2c3d4" }
 *
 * `ref` is the whole support story. It also goes back in an
 * `X-Diagramatix-Request-Id` header and onto the PartnerRequest row, so the
 * caller quotes eight characters and we land on the exact call.
 */
import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";

export type PartnerErrorCode =
  | "missing_input"
  | "unsupported_media_type"
  | "payload_too_large"
  | "invalid_key"
  | "key_revoked"
  | "scope_denied"
  | "rate_limited"
  | "quota_exceeded"
  | "org_policy_ai_disabled"
  | "ai_unavailable"
  | "ai_plan_failed"
  | "element_limit"
  | "render_failed"
  | "worker_lost"
  | "not_found"
  | "bad_request"
  | "server_error";

/** The default HTTP status for each code, so a caller cannot accidentally pair
 *  `invalid_key` with a 200. Override only where a code genuinely spans two. */
const STATUS: Record<PartnerErrorCode, number> = {
  missing_input: 400,
  unsupported_media_type: 415,
  payload_too_large: 413,
  invalid_key: 401,
  key_revoked: 401,
  scope_denied: 403,
  rate_limited: 429,
  quota_exceeded: 403,
  org_policy_ai_disabled: 403,
  ai_unavailable: 503,
  ai_plan_failed: 502,
  element_limit: 403,
  render_failed: 500,
  worker_lost: 500,
  not_found: 404,
  bad_request: 400,
  server_error: 500,
};

/** Eight hex characters. Short enough to read down a phone, long enough that
 *  two calls in the same day will not collide. */
export function newRef(): string {
  return randomBytes(4).toString("hex");
}

export interface PartnerErrorOptions {
  status?: number;
  ref?: string;
  /** e.g. Retry-After on a 429. */
  headers?: Record<string, string>;
}

/**
 * Build the error response. The message is written FOR THE CALLER — it says what
 * they should do, not what our stack trace said. A raw `err.message` must never
 * reach this function: a Prisma or LibreOffice failure handed to a partner is an
 * information leak and an unactionable one.
 */
export function partnerError(
  code: PartnerErrorCode,
  message: string,
  opts: PartnerErrorOptions = {},
): NextResponse {
  const ref = opts.ref ?? newRef();
  return NextResponse.json(
    { error: { code, message }, ref },
    {
      status: opts.status ?? STATUS[code],
      headers: { "X-Diagramatix-Request-Id": ref, ...(opts.headers ?? {}) },
    },
  );
}

/**
 * The 500 of last resort. Logs the real cause with the ref so it can be found in
 * the server log, and returns the ref to the caller so they can quote it —
 * without telling them anything about our internals.
 */
export function partnerServerError(err: unknown, where: string, ref?: string): NextResponse {
  const r = ref ?? newRef();
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[partner:${r}] ${where}: ${msg}`);
  return partnerError(
    "server_error",
    "Something went wrong at our end. Quote the ref if you report this.",
    { ref: r },
  );
}
