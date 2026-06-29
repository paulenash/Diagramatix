import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/app/lib/email";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";
import { createPasswordResetToken } from "@/app/lib/auth/passwordReset";

export async function POST(req: Request) {
  // SEC-06: throttle per IP — prevents reset-email bombing and token churn.
  const rl = rateLimit(`forgot:ip:${clientIp(req.headers)}`, 10, 60 * 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }

  const { email } = await req.json();

  if (!email) {
    return NextResponse.json(
      { error: "Email is required" },
      { status: 400 }
    );
  }

  const genericMessage =
    "If an account with that email exists, a reset link has been sent.";

  const minted = await createPasswordResetToken(email);
  if (minted) {
    await sendPasswordResetEmail(email, minted.resetUrl);
  }

  // Always return the generic message — never leak whether the account exists.
  return NextResponse.json({ message: genericMessage });
}
