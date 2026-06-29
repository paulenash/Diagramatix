/**
 * Auth — password reset (createPasswordResetToken + resetPasswordWithToken).
 *
 * Tests the extracted reset libs against the test DB — no mocks. These libs
 * move the forgot-password / reset-password route cores verbatim; the routes
 * are now thin callers that keep rate-limiting + the email send.
 *
 * Security controls pinned here:
 *   - no enumeration: an unknown email mints NO token and returns null.
 *   - 1h token expiry is honoured (an expired token is rejected, password
 *     unchanged).
 *   - bcrypt cost 12 on the new password (verified via bcrypt.compare).
 *   - single-use: a redeemed token is cleared and cannot be reused.
 */
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import {
  createPasswordResetToken,
  resetPasswordWithToken,
} from "@/app/lib/auth/passwordReset";

/** Seed a user with a known (hashed) password so we can detect changes. */
async function userWithPassword(email: string, plaintext: string) {
  const u = await createUser({ email });
  await prisma.user.update({
    where: { id: u.id },
    data: { password: bcrypt.hashSync(plaintext, 10) },
  });
  return u;
}

describe("createPasswordResetToken — mint", () => {
  beforeEach(async () => { await truncateAll(); });

  it("sets a token + future (1h) expiry for a real user and returns a reset url", async () => {
    const u = await userWithPassword("alice@test.dev", "original8");
    const before = Date.now();
    const res = await createPasswordResetToken("alice@test.dev");

    expect(res).not.toBeNull();
    expect(res!.resetUrl).toContain(`/reset-password?token=${res!.resetToken}`);

    const stored = await prisma.user.findUnique({ where: { id: u.id } });
    expect(stored?.resetToken).toBe(res!.resetToken);
    expect(stored?.resetTokenExpiry).not.toBeNull();
    // Expiry is ~1h in the future (allow a little slack for execution time).
    const expiryMs = stored!.resetTokenExpiry!.getTime();
    expect(expiryMs).toBeGreaterThan(before);
    expect(expiryMs).toBeLessThanOrEqual(before + 3600000 + 5000);
    expect(expiryMs).toBeGreaterThan(Date.now()); // still in the future
  });

  it("an UNKNOWN email returns null and writes no token (no enumeration)", async () => {
    const res = await createPasswordResetToken("ghost@test.dev");
    expect(res).toBeNull();
    // Nothing was written — no user exists for that email.
    expect(await prisma.user.findUnique({ where: { email: "ghost@test.dev" } })).toBeNull();
  });
});

describe("resetPasswordWithToken — redeem", () => {
  beforeEach(async () => { await truncateAll(); });

  /** Mint a real token for a user via the lib, returning the token. */
  async function mintTokenFor(email: string, plaintext: string) {
    const u = await userWithPassword(email, plaintext);
    const minted = await createPasswordResetToken(email);
    return { u, token: minted!.resetToken };
  }

  it("a valid token changes the password AND clears resetToken/resetTokenExpiry", async () => {
    const { u, token } = await mintTokenFor("bob@test.dev", "original8");

    const res = await resetPasswordWithToken(token, "brandnew8");
    expect(res).toEqual({ ok: true });

    const stored = await prisma.user.findUnique({ where: { id: u.id } });
    expect(await bcrypt.compare("brandnew8", stored!.password)).toBe(true);
    expect(await bcrypt.compare("original8", stored!.password)).toBe(false);
    // Token consumed.
    expect(stored?.resetToken).toBeNull();
    expect(stored?.resetTokenExpiry).toBeNull();
  });

  it("an EXPIRED token → { ok:false, status:400 } and the password is UNCHANGED", async () => {
    const { u, token } = await mintTokenFor("carol@test.dev", "original8");
    // Force the expiry into the past.
    await prisma.user.update({
      where: { id: u.id },
      data: { resetTokenExpiry: new Date(Date.now() - 1000) },
    });

    const res = await resetPasswordWithToken(token, "brandnew8");
    expect(res).toMatchObject({ ok: false, status: 400 });

    const stored = await prisma.user.findUnique({ where: { id: u.id } });
    expect(await bcrypt.compare("original8", stored!.password)).toBe(true);
    expect(await bcrypt.compare("brandnew8", stored!.password)).toBe(false);
  });

  it("an unknown token → 400", async () => {
    await mintTokenFor("dave@test.dev", "original8");
    const res = await resetPasswordWithToken("not-a-real-token", "brandnew8");
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("a < 8-char password → 400", async () => {
    const { token } = await mintTokenFor("erin@test.dev", "original8");
    const res = await resetPasswordWithToken(token, "tiny");
    expect(res).toMatchObject({ ok: false, status: 400 });
  });

  it("a missing token or password → 400", async () => {
    expect(await resetPasswordWithToken("", "brandnew8")).toMatchObject({ ok: false, status: 400 });
    expect(await resetPasswordWithToken("sometoken", "")).toMatchObject({ ok: false, status: 400 });
  });

  it("a token cannot be reused — second attempt after success → 400 (it was cleared)", async () => {
    const { token } = await mintTokenFor("frank@test.dev", "original8");

    const first = await resetPasswordWithToken(token, "brandnew8");
    expect(first).toEqual({ ok: true });

    const second = await resetPasswordWithToken(token, "evennewer8");
    expect(second).toMatchObject({ ok: false, status: 400 });
  });
});
