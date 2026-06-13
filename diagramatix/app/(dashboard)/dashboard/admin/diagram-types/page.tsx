import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { DiagramTypesClient } from "./DiagramTypesClient";

export default async function DiagramTypesAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <DiagramTypesClient />;
}
