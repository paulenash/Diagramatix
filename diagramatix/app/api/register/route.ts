import { NextResponse } from "next/server";
import { promotePendingAudienceMemberships } from "@/app/lib/bundleInvites";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";
import { registerUser } from "@/app/lib/auth/registerUser";

export async function POST(req: Request) {
  // SEC-06: throttle account creation per source IP (public, unauthenticated).
  const ip = clientIp(req.headers);
  const rl = rateLimit(`register:ip:${ip}`, 10, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const body = await req.json();
  const { email, name, password } = body;

  // Validation + lowercase-aware lookup + hash + create user/org/membership are
  // extracted to registerUser so they can be unit-tested directly. The route
  // maps its structured result to the matching HTTP status.
  const reg = await registerUser({ email, name, password });
  if (!reg.ok) {
    return NextResponse.json({ error: reg.error }, { status: reg.status });
  }
  const result = reg.user;

  // Promote any pending bundle invitations for this email — if someone
  // was invited to a bundle while their account didn't exist, this is
  // the moment we wire them up. Best-effort; sign-in retries on failure.
  try {
    await promotePendingAudienceMemberships(result.id, result.email);
  } catch (err) {
    console.error("[register] bundle invite promotion error:", err);
  }

  return NextResponse.json(result, { status: 201 });
}
