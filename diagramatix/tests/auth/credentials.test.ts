/**
 * Auth — login (verifyCredentials) + register (registerUser). Tests the
 * extracted credential/registration libs against the test DB — no mocks. These
 * are the security-critical chokepoints: the timing-safe login compare and the
 * account-creation path that must hash passwords and reject duplicates.
 *
 * verifyCredentials moves auth.ts's credential check verbatim (lowercase +
 * lookup + SEC-12 dummy-hash compare); registerUser moves the register route's
 * inline validate/hash/create core. Both routes are now thin callers.
 */
import { describe, it, expect, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";
import { truncateAll } from "../_setup/db";
import { createUser } from "../_setup/factories";
import { verifyCredentials, DUMMY_BCRYPT_HASH } from "@/app/lib/auth/credentials";
import { registerUser } from "@/app/lib/auth/registerUser";

/** A SubscriptionLevel "free" row — registerUser sets subscriptionLevelId:"free"
 *  on the new user (FK), so this must exist for registration to succeed. */
async function seedFreeTier() {
  await prisma.subscriptionLevel.create({
    data: { id: "free", name: "Free", sortOrder: 0, trialDays: 30 },
  });
}

describe("verifyCredentials — login check", () => {
  beforeEach(async () => { await truncateAll(); });

  async function userWithPassword(email: string, plaintext: string) {
    const u = await createUser({ email });
    await prisma.user.update({
      where: { id: u.id },
      data: { password: bcrypt.hashSync(plaintext, 10) },
    });
    return u;
  }

  it("correct password → the user record", async () => {
    const u = await userWithPassword("alice@test.dev", "Correct horse");
    const res = await verifyCredentials("alice@test.dev", "Correct horse");
    expect(res).not.toBeNull();
    expect(res?.id).toBe(u.id);
    expect(res?.email).toBe("alice@test.dev");
  });

  it("wrong password → null", async () => {
    await userWithPassword("bob@test.dev", "Correct horse");
    expect(await verifyCredentials("bob@test.dev", "wrong staple")).toBeNull();
  });

  it("non-existent email → null (and the dummy hash is a real bcrypt hash that never matches)", async () => {
    expect(await verifyCredentials("ghost@test.dev", "anything")).toBeNull();
    // The SEC-12 dummy hash is a valid bcrypt hash so the compare runs (constant
    // time) but never matches.
    expect(DUMMY_BCRYPT_HASH.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("anything", DUMMY_BCRYPT_HASH)).toBe(false);
  });

  it("email is matched case-insensitively", async () => {
    const u = await userWithPassword("carol@test.dev", "Correct horse");
    const res = await verifyCredentials("CAROL@TEST.DEV", "Correct horse");
    expect(res?.id).toBe(u.id);
  });
});

describe("registerUser — account creation", () => {
  beforeEach(async () => { await truncateAll(); await seedFreeTier(); });

  it("creates a new user with a HASHED password (not plaintext) + default Org/Owner", async () => {
    const res = await registerUser({ email: "new@test.dev", name: "New User", password: "supersecret1" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const stored = await prisma.user.findUnique({ where: { id: res.user.id } });
    expect(stored).not.toBeNull();
    expect(stored?.password).not.toBe("supersecret1"); // hashed, not plaintext
    expect(await bcrypt.compare("supersecret1", stored!.password)).toBe(true);
    expect(stored?.subscriptionLevelId).toBe("free");

    // CPS 230: a default Org with an Owner membership exists.
    const membership = await prisma.orgMember.findFirst({ where: { userId: res.user.id } });
    expect(membership?.role).toBe("Owner");
  });

  it("rejects a duplicate email (409)", async () => {
    await registerUser({ email: "dup@test.dev", name: null, password: "supersecret1" });
    const res = await registerUser({ email: "dup@test.dev", name: null, password: "another8chars" });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("rejects a password under the 8-char minimum (400)", async () => {
    const res = await registerUser({ email: "short@test.dev", name: null, password: "tiny" });
    expect(res).toMatchObject({ ok: false, status: 400 });
    // No user created.
    expect(await prisma.user.findUnique({ where: { email: "short@test.dev" } })).toBeNull();
  });

  it("rejects a missing email or password (400)", async () => {
    expect(await registerUser({ email: "", password: "supersecret1" })).toMatchObject({ ok: false, status: 400 });
    expect(await registerUser({ email: "x@test.dev", password: "" })).toMatchObject({ ok: false, status: 400 });
  });

  it("a registered user can then log in via verifyCredentials", async () => {
    await registerUser({ email: "loop@test.dev", name: "Loop", password: "roundtrip8" });
    const login = await verifyCredentials("loop@test.dev", "roundtrip8");
    expect(login).not.toBeNull();
    expect(login?.email).toBe("loop@test.dev");
  });
});
