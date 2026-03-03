import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/app/lib/db";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const diagrams = await prisma.diagram.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return (
    <DashboardClient
      diagrams={diagrams}
      userName={session.user.name ?? session.user.email ?? "User"}
    />
  );
}
