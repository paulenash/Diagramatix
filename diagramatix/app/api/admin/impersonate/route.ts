import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, IMPERSONATE_COOKIE, IMPERSONATE_MODE_COOKIE } from "@/app/lib/superuser";

/** POST — start impersonating a user */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id || !isSuperuser(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { userId, mode } = (await req.json()) as { userId?: string; mode?: string };
  if (!userId) {
    return NextResponse.json({ error: "userId required" }, { status: 400 });
  }
  const resolvedMode: "view" | "edit" = mode === "edit" ? "edit" : "view";

  // Validate target user exists
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cookieStore = await cookies();
  cookieStore.set(IMPERSONATE_COOKIE, userId, {
    path: "/",
    sameSite: "lax",
    httpOnly: false, // client JS reads for orange background
    maxAge: 60 * 60 * 8, // 8 hours
  });
  cookieStore.set(IMPERSONATE_MODE_COOKIE, resolvedMode, {
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ ok: true, user: target, mode: resolvedMode });
}

/** DELETE — stop impersonating */
export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE);
  cookieStore.delete(IMPERSONATE_MODE_COOKIE);

  return NextResponse.json({ ok: true });
}
