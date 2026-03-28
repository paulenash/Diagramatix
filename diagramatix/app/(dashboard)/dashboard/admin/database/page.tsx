import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { DatabaseClient } from "./DatabaseClient";

export default async function DatabasePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");

  return <DatabaseClient />;
}
