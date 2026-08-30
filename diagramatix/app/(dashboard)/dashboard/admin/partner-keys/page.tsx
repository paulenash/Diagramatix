import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { PartnerKeysClient } from "./PartnerKeysClient";

export const metadata = { title: "Process API Keys — SuperAdmin" };

export default async function PartnerKeysPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <PartnerKeysClient />;
}
