import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { PartnerApiClient } from "./PartnerApiClient";

export const metadata = { title: "Process API Usage — SuperAdmin" };

export default async function PartnerApiPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <PartnerApiClient />;
}
