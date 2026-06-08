import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { BubbleHelpClient } from "./BubbleHelpClient";

export default async function BubbleHelpAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <BubbleHelpClient />;
}
