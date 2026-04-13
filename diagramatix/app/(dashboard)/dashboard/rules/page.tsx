import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { RulesEditor } from "./RulesEditor";
import { isSuperuser } from "@/app/lib/superuser";

export const metadata = { title: "Diagramatix — Rules & Preferences" };

export default async function RulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return <RulesEditor isAdmin={isSuperuser(session)} />;
}
