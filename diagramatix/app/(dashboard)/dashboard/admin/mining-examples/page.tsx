import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { MiningExampleCatalogManager } from "./MiningExampleCatalogManager";

export const metadata = { title: "Diagramatix — DiagramatixMINER Example Catalog" };

export default async function AdminMiningExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <MiningExampleCatalogManager />;
}
