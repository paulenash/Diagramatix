import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { MiningExampleCatalogManager } from "./MiningExampleCatalogManager";

export const metadata = { title: "Diagramatix — DiagramatixMINER Example Catalog" };

export default async function AdminMiningExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <MiningExampleCatalogManager />;
}
