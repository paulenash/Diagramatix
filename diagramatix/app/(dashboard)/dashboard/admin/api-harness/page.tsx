import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ApiHarnessClient } from "./ApiHarnessClient";

export const metadata = { title: "Process API Test Harness — SuperAdmin" };

export default async function ApiHarnessPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <ApiHarnessClient />;
}
