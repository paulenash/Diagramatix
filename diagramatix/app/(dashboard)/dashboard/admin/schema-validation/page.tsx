import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { SchemaValidationClient } from "./SchemaValidationClient";

export const metadata = { title: "Schema Validation — SuperAdmin" };

export default async function SchemaValidationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <SchemaValidationClient />;
}
