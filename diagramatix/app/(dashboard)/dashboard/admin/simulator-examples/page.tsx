import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSuperuser } from "@/app/lib/superuser";
import { ExampleCatalogManager } from "./ExampleCatalogManager";

export const metadata = { title: "Diagramatix — Simulator Example Catalog" };

export default async function AdminSimulatorExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!isSuperuser(session)) redirect("/dashboard");
  return <ExampleCatalogManager />;
}
