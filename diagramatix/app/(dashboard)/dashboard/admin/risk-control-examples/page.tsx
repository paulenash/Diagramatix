import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { RiskControlExampleCatalogManager } from "./RiskControlExampleCatalogManager";

export const metadata = { title: "Diagramatix — Risk & Control Example Catalog" };

export default async function Page() {
  const session = await auth();
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <RiskControlExampleCatalogManager />;
}
