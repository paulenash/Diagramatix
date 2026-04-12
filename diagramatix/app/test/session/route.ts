import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";

export async function GET() {
  const session = await auth();
  const userId = session?.user?.id;
  let member = null;
  if (userId) {
    member = await prisma.orgMember.findFirst({
      where: { userId },
      select: { orgId: true, userId: true, role: true },
    });
  }
  return NextResponse.json({
    sessionUserId: userId,
    sessionEmail: session?.user?.email,
    orgMember: member,
  });
}
