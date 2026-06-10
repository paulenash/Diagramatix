import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/app/lib/db";
import { promotePendingAudienceMemberships } from "@/app/lib/bundleInvites";

export async function POST(req: Request) {
  const body = await req.json();
  const { email, name, password } = body;

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required" },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "Email already registered" },
      { status: 409 }
    );
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  // CPS 230: every new user gets a default Org with Owner role.
  // Wrap user + org + membership in a single transaction so a failure leaves
  // no partial state behind.
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name: name || null,
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
    const displayName = user.name ?? user.email;
    const org = await tx.org.create({
      data: { name: `${displayName}'s Org`, entityType: "Other" },
    });
    await tx.orgMember.create({
      data: { orgId: org.id, userId: user.id, role: "Owner" },
    });
    return user;
  });

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
