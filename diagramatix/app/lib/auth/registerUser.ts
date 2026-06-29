/**
 * Account creation core — the validate + hash + create-user-org-membership
 * logic extracted verbatim from POST /api/register so it can be unit-tested
 * directly against the DB. The route keeps its request-scoped concerns
 * (rate-limiting, JSON parsing, bundle-invite promotion, HTTP status mapping)
 * and calls this for the work.
 *
 * Behaviour is identical to the previous inline route code:
 *   - SEC-11 password policy: reject non-string or < 8 chars.
 *   - reject a duplicate email.
 *   - bcrypt-hash at cost 12.
 *   - CPS 230: create user + default Org + Owner membership in one transaction.
 *
 * Note: the email is NOT lowercased (mirrors the prior route behaviour). The
 * login path lowercases on lookup, so a mixed-case registration is still
 * reachable at sign-in.
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";

export type RegisterResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; status: number; error: string };

export async function registerUser(input: {
  email?: unknown;
  name?: unknown;
  password?: unknown;
}): Promise<RegisterResult> {
  const { email, name, password } = input;

  if (!email || !password) {
    return { ok: false, status: 400, error: "Email and password are required" };
  }

  // SEC-11: enforce a minimum password policy on the primary account-creation
  // path (reset-password already requires >= 8; register previously had none).
  if (typeof password !== "string" || password.length < 8) {
    return { ok: false, status: 400, error: "Password must be at least 8 characters" };
  }

  const existing = await prisma.user.findUnique({ where: { email: email as string } });
  if (existing) {
    return { ok: false, status: 409, error: "Email already registered" };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // CPS 230: every new user gets a default Org with Owner role.
  // Wrap user + org + membership in a single transaction so a failure leaves
  // no partial state behind.
  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: email as string,
        name: (name as string | null | undefined) || null,
        password: hashedPassword,
        // New sign-ups start on Free. Existing users were grandfathered to
        // Expert by scripts/seed-subscriptions.ts so launch doesn't impose
        // limits retroactively. subscriptionAssignedAt drives the Free
        // tier's 30-day trial expiry.
        subscriptionLevelId: "free",
        subscriptionAssignedAt: new Date(),
      },
      select: { id: true, email: true, name: true },
    });
    const displayName = created.name ?? created.email;
    const org = await tx.org.create({
      data: { name: `${displayName}'s Org`, entityType: "Other" },
    });
    await tx.orgMember.create({
      data: { orgId: org.id, userId: created.id, role: "Owner" },
    });
    return created;
  });

  return { ok: true, user };
}
