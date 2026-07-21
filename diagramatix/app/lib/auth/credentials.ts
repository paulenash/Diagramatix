/**
 * Credential verification — the email+password check, extracted verbatim from
 * auth.ts's `authorize` so it can be unit-tested directly against the DB. The
 * rate-limiting stays in `authorize` (it wraps this call); the verification
 * logic — lowercase the email, look up the user, and the SEC-12 timing-safe
 * bcrypt compare against a dummy hash when the user is missing — lives here.
 *
 * SEC-12: a fixed, valid bcrypt hash compared against when the user doesn't
 * exist, so verification takes ~the same time whether or not the email is
 * registered (closes the timing-enumeration oracle). It never matches anything.
 */
import { prisma } from "@/app/lib/db";
import bcrypt from "bcryptjs";

export const DUMMY_BCRYPT_HASH = "$2b$12$qO.Q/cmrOm8qGc98tNpKP.eQ.pkPQmLyocrlAbVqID.fiD9T56GP2";

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const normalised = email.toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalised },
  });

  // SEC-12: always run a bcrypt compare (against a dummy hash when the user
  // is missing) so the response time doesn't reveal whether the email exists.
  const hashToCheck = user?.password || DUMMY_BCRYPT_HASH;
  const passwordMatch = await bcrypt.compare(password, hashToCheck);

  if (!user || !passwordMatch) return null;

  // A3d (ENT-04): if any of the user's orgs mandates single sign-on, password
  // login is blocked — they must use the Microsoft provider. Returning null keeps
  // the timing/enumeration profile identical to a wrong password.
  const ssoOrg = await prisma.orgMember.findFirst({
    where: { userId: user.id, org: { requireSso: true } },
    select: { id: true },
  });
  if (ssoOrg) return null;

  return {
    id: user.id,
    email: user.email,
    name: user.name,
  };
}
