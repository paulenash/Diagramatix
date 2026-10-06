/**
 * GET /api/example-access — whether the signed-in user is on an examples-only plan (Free / Introductory) and how many
 * examples of each set they may adopt. UX only: the Simulator / Process Mining routes and the adopt routes enforce it.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getExampleAccess, UNRESTRICTED } from "@/app/lib/features/exampleAccess";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(UNRESTRICTED);
  return NextResponse.json(await getExampleAccess(session.user.id));
}
