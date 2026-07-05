import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { RiskControlExampleCatalogManager } from "./RiskControlExampleCatalogManager";

export const metadata = { title: "Diagramatix — Risk & Control Example Catalog" };

export default async function Page() {
  const session = await auth();
  if (!isSuperuser(session)) redirect("/dashboard");
  return <RiskControlExampleCatalogManager />;
}
