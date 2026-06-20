import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { ExamplesGallery } from "./ExamplesGallery";

export const metadata = { title: "Diagramatix — Simulator Examples" };

export default async function SimulatorExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <ExamplesGallery isAdmin={isSuperuser(session)} />;
}
