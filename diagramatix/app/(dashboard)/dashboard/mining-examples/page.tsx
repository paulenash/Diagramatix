import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { isSuperuser } from "@/app/lib/superuser";
import { MiningExamplesGallery } from "./MiningExamplesGallery";

export const metadata = { title: "Diagramatix — DiagramatixMINER Examples" };

export default async function MiningExamplesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return <MiningExamplesGallery isAdmin={isSuperuser(session)} />;
}
