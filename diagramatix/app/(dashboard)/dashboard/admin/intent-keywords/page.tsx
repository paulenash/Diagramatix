import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { IntentKeywordsClient } from "./IntentKeywordsClient";

export default async function IntentKeywordsAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <IntentKeywordsClient />;
}
