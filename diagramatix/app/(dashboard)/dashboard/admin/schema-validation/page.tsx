import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { SchemaValidationClient } from "./SchemaValidationClient";

export const metadata = { title: "Schema Validation — SuperAdmin" };

export default async function SchemaValidationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <SchemaValidationClient />;
}
