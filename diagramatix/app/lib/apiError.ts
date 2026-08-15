import { NextResponse } from "next/server";

/**
 * SEC-09: a catch-all 500 must not echo raw error text to the client. A Prisma /
 * Postgres error's `.message` names tables, columns and constraints and can carry
 * fragments of a failing query — reconnaissance that eases further attacks. This
 * logs the FULL detail server-side under a short correlation `ref`, and returns
 * only a generic message plus that ref, so a user's report can still be traced
 * back to the server log without exposing internals.
 *
 * Use in a route's catch-all: `return serverError(err, "PUT /api/diagrams/[id]")`.
 * Deliberately NOT for 4xx validation responses — those carry intentional,
 * safe, user-facing messages and should stay as they are.
 */
export function serverError(err: unknown, context?: string): NextResponse {
  const ref = crypto.randomUUID().slice(0, 8);
  const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
  console.error(`[api-error]${context ? ` ${context}` : ""} ref=${ref}:`, detail);
  return NextResponse.json(
    { error: "Something went wrong on our end. Please try again.", ref },
    { status: 500 },
  );
}
