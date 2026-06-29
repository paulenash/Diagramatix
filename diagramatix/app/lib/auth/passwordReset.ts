/**
 * Password-reset core — the token mint + token-redeem logic extracted verbatim
 * from POST /api/auth/forgot-password and POST /api/auth/reset-password so it
 * can be unit-tested directly against the DB. The routes keep their
 * request-scoped concerns (rate-limiting, JSON parsing, the email send, HTTP
 * status mapping) and call these for the work.
 *
 * Behaviour is identical to the previous inline route code:
 *   - createPasswordResetToken: returns null and writes NOTHING for an unknown
 *     email (no enumeration); otherwise mints crypto.randomBytes(32) hex token
 *     + 1h expiry, stores them, returns token + reset url.
 *   - resetPasswordWithToken: required-fields + >= 8 length checks, lookup by
 *     resetToken, expiry check, bcrypt-hash at cost 12, set password + clear the
 *     token/expiry.
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

/**
 * Mint a password-reset token for `email`. Returns the token + reset url, or
 * null (writing nothing) when no user has that email — the caller ALWAYS
 * returns a generic message so existence is never leaked.
 */
export async function createPasswordResetToken(
  email: string,
): Promise<{ resetToken: string; resetUrl: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken, resetTokenExpiry },
  });

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;

  return { resetToken, resetUrl };
}

export type ResetPasswordResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Redeem a reset token: validate required fields + min length, look up the user
 * by resetToken, check expiry, bcrypt-hash(12) the new password and clear the
 * token. Returns a tagged result the route maps to a JSON response.
 */
export async function resetPasswordWithToken(
  token: unknown,
  password: unknown,
): Promise<ResetPasswordResult> {
  if (!token || !password) {
    return { ok: false, status: 400, error: "Token and password are required" };
  }

  if ((password as string).length < 8) {
    return { ok: false, status: 400, error: "Password must be at least 8 characters" };
  }

  const user = await prisma.user.findUnique({
    where: { resetToken: token as string },
  });

  if (!user || !user.resetTokenExpiry || user.resetTokenExpiry < new Date()) {
    return { ok: false, status: 400, error: "Invalid or expired reset token" };
  }

  const hashedPassword = await bcrypt.hash(password as string, 12);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiry: null,
    },
  });

  return { ok: true };
}
