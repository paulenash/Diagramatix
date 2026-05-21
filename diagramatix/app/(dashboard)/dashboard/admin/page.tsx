import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { isSuperuser, SUPERUSER_EMAILS } from "@/app/lib/superuser";
import { AdminClient } from "./AdminClient";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      createdAt: true,
      lastSeenAt: true,
      currentDiagramId: true,
      currentDiagramName: true,
      subscriptionLevel: {
        select: { id: true, name: true },
      },
      _count: {
        select: {
          projects: true,
          diagrams: true,
        },
      },
    },
  });

  // Serialise dates + map the synthetic "Administration" tier for users
  // in the SUPERUSER_EMAILS allowlist (those bypass enforcement so their
  // stored tier — usually Expert from the grandfather seed — is moot).
  const usersForClient = users.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    createdAt: u.createdAt.toISOString(),
    lastSeenAt: u.lastSeenAt ? u.lastSeenAt.toISOString() : null,
    currentDiagramId: u.currentDiagramId,
    currentDiagramName: u.currentDiagramName,
    _count: u._count,
    subscriptionLabel: SUPERUSER_EMAILS.has(u.email)
      ? "Administration"
      : (u.subscriptionLevel?.name ?? "—"),
    isAdmin: SUPERUSER_EMAILS.has(u.email),
  }));

  return <AdminClient users={usersForClient} currentUserId={session.user.id} />;
}
