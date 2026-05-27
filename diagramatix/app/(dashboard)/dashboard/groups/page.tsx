import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GroupsClient } from "./GroupsClient";

export default async function GroupsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <GroupsClient currentUserId={session.user.id} />;
}
