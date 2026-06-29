import { NextResponse } from "next/server";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";
import { resetPasswordWithToken } from "@/app/lib/auth/passwordReset";

export async function POST(req: Request) {
  // SEC-06: throttle per IP — reset endpoint abuse / token guessing.
  const rl = rateLimit(`reset:ip:${clientIp(req.headers)}`, 20, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { token, password } = await req.json();

  const result = await resetPasswordWithToken(token, password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    message: "Password has been reset. You can now sign in.",
  });
}
