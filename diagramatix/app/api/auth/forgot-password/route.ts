import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/app/lib/db";
import { sendPasswordResetEmail } from "@/app/lib/email";
import { rateLimit, clientIp } from "@/app/lib/rateLimit";

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

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ message: genericMessage });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  await sendPasswordResetEmail(email, resetUrl);

  return NextResponse.json({ message: genericMessage });
}
