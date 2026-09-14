import { NextResponse } from "next/server";
import { prisma } from "@/app/lib/db";
import { checkHealth } from "@/app/lib/health";

/**
 * Unauthenticated readiness probe — see `app/lib/health.ts` for why it exists.
 * Deliberately outside the proxy's protected prefixes (`/api` is not matched):
 * App Service has no session. The ping goes through Prisma so the pool the app
 * actually serves from is the one that gets warmed.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { status, body } = await checkHealth(() => prisma.$queryRaw`SELECT 1`, {
    commit: process.env.COMMIT_SHA ?? "",
    uptimeSec: process.uptime(),
  });
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
