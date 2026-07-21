import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isActingSuperuser } from "@/app/lib/auth/orgPolicy";
import { ExampleCatalogManager } from "./ExampleCatalogManager";

export const metadata = { title: "Diagramatix — Simulator Example Catalog" };

export default async function AdminSimulatorExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await isActingSuperuser(session))) redirect("/dashboard");
  return <ExampleCatalogManager />;
}
