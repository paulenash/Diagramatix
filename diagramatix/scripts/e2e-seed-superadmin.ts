/**
 * Seed a SuperAdmin account into the e2e database (diagramatix_test) with a
 * KNOWN password, so the admin-surface e2e specs can sign in. The email is on
 * the SUPERUSER_EMAILS allowlist. Idempotent: if the account already exists
 * (e.g. left by a prior run or restored data) its password is reset to the known
 * one; otherwise it's created fully (user + Org + Owner membership) via the same
 * registerUser the app uses. TEST DB ONLY — never run against prod.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../app/lib/db";
import { registerUser } from "../app/lib/auth/registerUser";
import { E2E_ADMIN } from "../e2e/_user";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: E2E_ADMIN.email } });
  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data: { password: await bcrypt.hash(E2E_ADMIN.password, 12) } });
    console.log(`Reset password for existing superadmin ${E2E_ADMIN.email}.`);
  } else {
    const r = await registerUser({ email: E2E_ADMIN.email, name: E2E_ADMIN.name, password: E2E_ADMIN.password });
    if (!r.ok) throw new Error(`registerUser failed: ${r.error}`);
    console.log(`Created superadmin ${E2E_ADMIN.email}.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
