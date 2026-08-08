import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { DiffRunsAdminClient } from "@/app/components/diff/DiffRunsAdminClient";

export default async function AdminDiffRunsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <DiffRunsAdminClient scope="super" />;
}
