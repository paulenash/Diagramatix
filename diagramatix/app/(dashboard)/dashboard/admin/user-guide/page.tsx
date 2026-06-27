import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { UserGuideEditorClient } from "./UserGuideEditorClient";

export const metadata = { title: "User Guide editor — SuperAdmin" };

export default async function UserGuideAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <UserGuideEditorClient />;
}
